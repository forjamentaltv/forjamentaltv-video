const express = require('express');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PEXELS_KEY = process.env.PEXELS_KEY || '';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function doRequest(currentUrl) {
      const protocol = currentUrl.startsWith('https') ? https : http;
      protocol.get(currentUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
        if ([301, 302, 303].includes(response.statusCode)) {
          doRequest(response.headers.location);
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    }
    doRequest(url);
  });
}

function searchPexelsVideo(query, orientation = 'landscape') {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'api.pexels.com',
      path: '/videos/search?query=' + q + '&per_page=5&orientation=' + orientation,
      headers: { Authorization: PEXELS_KEY }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const videos = json.videos;
          if (!videos || videos.length === 0) return resolve(null);
          const video = videos[Math.floor(Math.random() * videos.length)];
          const file = video.video_files.find(f => f.quality === 'hd') || video.video_files[0];
          resolve(file.link);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function searchPexelsPhoto(query) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(query);
    const options = {
      hostname: 'api.pexels.com',
      path: '/v1/search?query=' + q + '&per_page=5&orientation=landscape',
      headers: { Authorization: PEXELS_KEY }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const photos = json.photos;
          if (!photos || photos.length === 0) return resolve(null);
          const photo = photos[Math.floor(Math.random() * Math.min(photos.length, 3))];
          resolve(photo.src.large2x || photo.src.large || photo.src.original);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getPhotoQueryForTema(tema, filosofo) {
  const t = (tema || '').toLowerCase();
  const f = (filosofo || '').toLowerCase();
  if (t.includes('control') || t.includes('soltar')) return 'hands open water freedom nature';
  if (t.includes('disciplina') || t.includes('habito')) return 'focused determination training sunrise';
  if (t.includes('paz') || t.includes('serenidad') || t.includes('tranquilidad')) return 'calm peaceful nature meditation lake';
  if (t.includes('muerte') || t.includes('mortalidad') || t.includes('memento')) return 'ancient ruins dramatic sky stone';
  if (t.includes('fortuna') || t.includes('adversidad') || t.includes('resiliencia')) return 'storm sea waves resilience nature';
  if (t.includes('tiempo') || t.includes('presente') || t.includes('instante')) return 'hourglass time sunset dramatic sky';
  if (t.includes('fuerza') || t.includes('mental')) return 'mountain peak dramatic clouds strength';
  if (t.includes('proposito') || t.includes('vida') || t.includes('alma')) return 'sunrise horizon road purpose journey';
  if (f.includes('seneca') || f.includes('seneca')) return 'ancient rome columns philosophy sunset';
  if (f.includes('marco') || f.includes('aurelio')) return 'ancient warrior emperor stone dramatic';
  if (f.includes('epicteto')) return 'freedom chains broken philosophy ancient';
  return 'philosophy wisdom meditation ancient stone';
}

function wrapText(text, maxLen) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxLen) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function escapeXml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.post('/generate-thumbnail', async (req, res) => {
  const { titulo, filosofo, episodio, tema } = req.body;
  if (!titulo) return res.status(400).json({ error: 'titulo required' });

  const jobId = Date.now();
  const photoPath = '/tmp/thumb-bg-' + jobId + '.jpg';
  const outputPath = '/tmp/thumbnail-' + jobId + '.jpg';

  try {
    const sharp = require('sharp');
    const photoQuery = getPhotoQueryForTema(tema || titulo, filosofo);
    console.log('Buscando foto: ' + photoQuery);
    const photoUrl = await searchPexelsPhoto(photoQuery);

    const titleLines = wrapText((titulo || '').toUpperCase(), 18);
    const filosofoText = filosofo ? ('— ' + filosofo + ' —') : '';
    const W = 1280, H = 720;
    const titleFontSize = titleLines.length > 2 ? 78 : 88;
    const lineHeight = titleFontSize * 1.15;
    const totalTitleHeight = titleLines.length * lineHeight;
    const titleStartY = (H / 2) - (totalTitleHeight / 2) + 20;
    const epText = episodio ? ('EP. ' + episodio) : '';

    const titleSvgLines = titleLines.map((line, i) => {
      const y = titleStartY + i * lineHeight;
      return '<text x="' + (W/2) + '" y="' + y + '" text-anchor="middle" font-family="Arial Black, Arial" font-size="' + titleFontSize + '" font-weight="900" fill="white" stroke="black" stroke-width="3" paint-order="stroke">' + escapeXml(line) + '</text>';
    }).join('\n');

    const filosofoY = titleStartY + totalTitleHeight + 50;

    const svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000000" stop-opacity="0.25"/><stop offset="45%" stop-color="#000000" stop-opacity="0.55"/><stop offset="100%" stop-color="#000000" stop-opacity="0.80"/></linearGradient></defs><rect width="' + W + '" height="' + H + '" fill="url(#grad)"/>' +
      (epText ? '<text x="64" y="68" font-family="Arial" font-size="28" font-weight="bold" fill="#c9a84c" letter-spacing="4">' + escapeXml(epText) + '</text>' : '') +
      '<line x1="' + (W/2 - 120) + '" y1="' + (titleStartY - 36) + '" x2="' + (W/2 + 120) + '" y2="' + (titleStartY - 36) + '" stroke="#c9a84c" stroke-width="2" opacity="0.8"/>' +
      titleSvgLines +
      (filosofoText ? '<text x="' + (W/2) + '" y="' + filosofoY + '" text-anchor="middle" font-family="Arial" font-size="38" fill="#c9a84c" letter-spacing="2">' + escapeXml(filosofoText) + '</text>' : '') +
      '<text x="' + (W/2) + '" y="' + (H - 38) + '" text-anchor="middle" font-family="Arial" font-size="22" font-weight="bold" fill="#c9a84c" letter-spacing="6" opacity="0.9">FORJA MENTAL TV</text>' +
      '<line x1="' + (W/2 - 180) + '" y1="' + (H - 58) + '" x2="' + (W/2 + 180) + '" y2="' + (H - 58) + '" stroke="#c9a84c" stroke-width="1" opacity="0.5"/></svg>';

    if (photoUrl) {
      await downloadFile(photoUrl, photoPath);
      await sharp(photoPath)
        .resize(W, H, { fit: 'cover', position: 'centre' })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 92 })
        .toFile(outputPath);
      fs.existsSync(photoPath) && fs.unlinkSync(photoPath);
    } else {
      await sharp({ create: { width: W, height: H, channels: 3, background: { r: 10, g: 10, b: 10 } } })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .jpeg({ quality: 92 })
        .toFile(outputPath);
    }

    console.log('Thumbnail generada: ' + titulo);
    res.download(outputPath, 'thumbnail-ep' + (episodio || jobId) + '.jpg', () => {
      fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error(err);
    [photoPath, outputPath].forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    res.status(500).json({ error: err.message });
  }
});

function extractKeywords(guion) {
  return [
    { keywords: ['water hands control', 'hands water drops'] },
    { keywords: ['exhausted person tired', 'stress anxiety mind'] },
    { keywords: ['ancient rome philosophy', 'seneca stoic ancient'] },
    { keywords: ['border boundary nature', 'clarity mind meditation'] },
    { keywords: ['letting go freedom nature', 'open hands release'] },
    { keywords: ['calm serenity mountain', 'peace nature landscape'] },
    { keywords: ['inner strength person', 'confidence walking path'] },
  ];
}

function extractShortKeywords(tema) {
  const t = (tema || '').toLowerCase();
  if (t.includes('control') || t.includes('soltar')) return ['letting go freedom', 'open hands release freedom'];
  if (t.includes('disciplina') || t.includes('habito')) return ['focused person working discipline', 'training gym motivation'];
  if (t.includes('estoic') || t.includes('marco') || t.includes('seneca')) return ['ancient rome philosophy meditation', 'stoic wisdom ancient'];
  if (t.includes('paz') || t.includes('serenidad')) return ['calm peaceful nature meditation', 'serene landscape sunrise'];
  if (t.includes('proposito') || t.includes('vida')) return ['sunrise horizon purpose life', 'mountain peak success'];
  if (t.includes('fuerza') || t.includes('mental')) return ['inner strength mental power', 'confident person walking'];
  return ['philosophy wisdom meditation', 'calm focused person thinking'];
}

async function prepareVideoClips(guion, jobId, audioDuration, orientation) {
  const sections = extractKeywords(guion);
  const clipDuration = Math.ceil(audioDuration / sections.length);
  const clipPaths = [];
  const size = orientation === 'portrait' ? '1080:1920' : '1280:720';
  for (let i = 0; i < sections.length; i++) {
    const keyword = sections[i].keywords[0];
    const rawPath = '/tmp/raw-' + jobId + '-' + i + '.mp4';
    const clipPath = '/tmp/clip-' + jobId + '-' + i + '.mp4';
    try {
      const videoUrl = await searchPexelsVideo(keyword, orientation);
      if (!videoUrl) throw new Error('No video');
      await downloadFile(videoUrl, rawPath);
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -i "' + rawPath + '" -t ' + clipDuration + ' -vf "scale=' + size + ':force_original_aspect_ratio=increase,crop=' + size + '" -c:v libx264 -preset ultrafast -an "' + clipPath + '"', (err) => err ? reject(err) : resolve());
      });
      fs.unlinkSync(rawPath);
      clipPaths.push(clipPath);
    } catch(e) {
      const [w, h] = size.split(':');
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -f lavfi -i color=c=0x0a0a0a:size=' + w + 'x' + h + ':rate=25 -t ' + clipDuration + ' -c:v libx264 -preset ultrafast "' + clipPath + '"', (err) => err ? reject(err) : resolve());
      });
      clipPaths.push(clipPath);
    }
  }
  return clipPaths;
}

async function prepareShortClips(tema, jobId, duration) {
  const keywords = extractShortKeywords(tema);
  const clipPaths = [];
  const sections = 3;
  const clipDuration = Math.ceil(duration / sections);
  for (let i = 0; i < sections; i++) {
    const keyword = keywords[i % keywords.length];
    const clipPath = '/tmp/clip-' + jobId + '-' + i + '.mp4';
    try {
      const videoUrl = await searchPexelsVideo(keyword, 'portrait');
      if (!videoUrl) throw new Error('No video');
      const rawPath = '/tmp/raw-' + jobId + '-' + i + '.mp4';
      await downloadFile(videoUrl, rawPath);
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -i "' + rawPath + '" -t ' + clipDuration + ' -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:v libx264 -preset ultrafast -an "' + clipPath + '"', (err) => err ? reject(err) : resolve());
      });
      fs.unlinkSync(rawPath);
      clipPaths.push(clipPath);
    } catch(e) {
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -f lavfi -i color=c=0x0a0a0a:size=1080x1920:rate=25 -t ' + clipDuration + ' -c:v libx264 -preset ultrafast "' + clipPath + '"', (err) => err ? reject(err) : resolve());
      });
      clipPaths.push(clipPath);
    }
  }
  return clipPaths;
}

function generateSubtitles(guion, audioDuration, outputSrt, fontSize) {
  const sentences = guion.match(/[^.!?]+[.!?]+/g) || [guion];
  const timePerSentence = audioDuration / sentences.length;
  let srt = '';
  sentences.forEach((sentence, i) => {
    const start = i * timePerSentence;
    const end = (i + 1) * timePerSentence;
    const toTime = (s) => {
      const h = Math.floor(s / 3600).toString().padStart(2, '0');
      const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
      const sec = Math.floor(s % 60).toString().padStart(2, '0');
      const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
      return h + ':' + m + ':' + sec + ',' + ms;
    };
    srt += (i + 1) + '\n' + toTime(start) + ' --> ' + toTime(end) + '\n' + sentence.trim() + '\n\n';
  });
  fs.writeFileSync(outputSrt, srt);
}

app.post('/render', async (req, res) => {
  const { audioUrl, guion, tema, episodio } = req.body;
  const jobId = Date.now();
  const audioPath = '/tmp/audio-' + jobId + '.mp3';
  const concatFile = '/tmp/concat-' + jobId + '.txt';
  const mergedVideo = '/tmp/merged-' + jobId + '.mp4';
  const srtPath = '/tmp/subs-' + jobId + '.srt';
  const outputPath = '/tmp/video-' + jobId + '.mp4';
  try {
    await downloadFile(audioUrl, audioPath);
    const audioDuration = await new Promise((resolve, reject) => {
      exec('ffprobe -i "' + audioPath + '" -show_entries format=duration -v quiet -of csv=p=0', (err, stdout) => err ? reject(err) : resolve(parseFloat(stdout.trim())));
    });
    const clipPaths = await prepareVideoClips(guion, jobId, audioDuration, 'landscape');
    fs.writeFileSync(concatFile, clipPaths.map(p => "file '" + p + "'").join('\n'));
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c copy "' + mergedVideo + '"', (err) => err ? reject(err) : resolve());
    });
    generateSubtitles(guion || tema, audioDuration, srtPath, 18);
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -i "' + mergedVideo + '" -i "' + audioPath + '" -vf "subtitles=' + srtPath + ':force_style='FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Alignment=2'" -shortest -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 192k "' + outputPath + '"', (err, stdout, stderr) => err ? (console.error(stderr), reject(err)) : resolve());
    });
    clipPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    [concatFile, mergedVideo, audioPath, srtPath].forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    res.download(outputPath, 'forjamentaltv-ep' + episodio + '.mp4', () => fs.existsSync(outputPath) && fs.unlinkSync(outputPath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/render-short', async (req, res) => {
  const { audioUrl, texto, gancho, tema, episodio, shortNum } = req.body;
  const jobId = Date.now();
  const audioPath = '/tmp/audio-short-' + jobId + '.mp3';
  const concatFile = '/tmp/concat-short-' + jobId + '.txt';
  const mergedVideo = '/tmp/merged-short-' + jobId + '.mp4';
  const srtPath = '/tmp/subs-short-' + jobId + '.srt';
  const outputPath = '/tmp/short-' + jobId + '.mp4';
  try {
    await downloadFile(audioUrl, audioPath);
    const audioDuration = await new Promise((resolve, reject) => {
      exec('ffprobe -i "' + audioPath + '" -show_entries format=duration -v quiet -of csv=p=0', (err, stdout) => err ? reject(err) : resolve(Math.min(parseFloat(stdout.trim()), 60)));
    });
    const clipPaths = await prepareShortClips(tema || texto, jobId, audioDuration);
    fs.writeFileSync(concatFile, clipPaths.map(p => "file '" + p + "'").join('\n'));
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c copy "' + mergedVideo + '"', (err) => err ? reject(err) : resolve());
    });
    const guionShort = texto || gancho || tema;
    generateSubtitles(guionShort, audioDuration, srtPath, 36);
    const srtEscaped = srtPath.replace(/'/g, "\'");
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -i "' + mergedVideo + '" -i "' + audioPath + '" -vf "colormatrix=bt601:bt709,subtitles='' + srtEscaped + '':force_style='FontSize=36,FontName=Arial,Bold=1,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=3,Shadow=2,Alignment=10,MarginV=200',drawtext=text='FORJA MENTAL TV':fontsize=28:fontcolor=0xc9a84c:x=(w-text_w)/2:y=h-100:box=0" -shortest -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -s 1080x1920 "' + outputPath + '"', (err, stdout, stderr) => err ? (console.error(stderr), reject(err)) : resolve());
    });
    clipPaths.forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    [concatFile, mergedVideo, audioPath, srtPath].forEach(p => fs.existsSync(p) && fs.unlinkSync(p));
    res.download(outputPath, 'forjamentaltv-ep' + episodio + '-short' + shortNum + '.mp4', () => fs.existsSync(outputPath) && fs.unlinkSync(outputPath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function uploadToYouTube(videoPath, fileSize, uploadUrl) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(videoPath);
    const parsed = new URL(uploadUrl);
    const req = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': fileSize } }, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(JSON.parse(data).id || data); } catch(e) { resolve(data); }
        } else {
          reject(new Error('YouTube upload failed: ' + response.statusCode + ' ' + data.substring(0, 300)));
        }
      });
    });
    req.on('error', reject);
    fileStream.pipe(req);
  });
}

app.post('/transfer-to-youtube', async (req, res) => {
  const { driveFileId, youtubeUploadUrl } = req.body;
  const jobId = Date.now();
  const videoPath = '/tmp/transfer-' + jobId + '.mp4';
  try {
    const driveUrl = 'https://drive.usercontent.google.com/download?id=' + driveFileId + '&export=download&confirm=t';
    await downloadFile(driveUrl, videoPath);
    const fileSize = fs.statSync(videoPath).size;
    const videoId = await uploadToYouTube(videoPath, fileSize, youtubeUploadUrl);
    fs.existsSync(videoPath) && fs.unlinkSync(videoPath);
    res.json({ videoId, success: true });
  } catch (err) {
    console.error(err);
    fs.existsSync(videoPath) && fs.unlinkSync(videoPath);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: '4.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Forja Mental TV v4.0 en puerto ' + PORT));
