const express = require('express');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PEXELS_KEY = 'X0Hwc4FRVXKTYxSq0rzA66R7ke6LL33EuynC6N3eTdakGWxSCG0L8r3E';

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
      path: `/videos/search?query=${q}&per_page=5&orientation=${orientation}`,
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

function extractKeywords(guion) {
  const sections = [
    { keywords: ['water hands control', 'hands water drops'] },
    { keywords: ['exhausted person tired', 'stress anxiety mind'] },
    { keywords: ['ancient rome philosophy', 'seneca stoic ancient'] },
    { keywords: ['border boundary nature', 'clarity mind meditation'] },
    { keywords: ['letting go freedom nature', 'open hands release'] },
    { keywords: ['calm serenity mountain', 'peace nature landscape'] },
    { keywords: ['inner strength person', 'confidence walking path'] },
  ];
  return sections;
}

function extractShortKeywords(tema) {
  const temaLower = (tema || '').toLowerCase();
  if (temaLower.includes('control') || temaLower.includes('soltar')) {
    return ['letting go freedom', 'open hands release freedom'];
  } else if (temaLower.includes('disciplina') || temaLower.includes('habito')) {
    return ['focused person working discipline', 'training gym motivation'];
  } else if (temaLower.includes('estoic') || temaLower.includes('marco aurelio') || temaLower.includes('seneca')) {
    return ['ancient rome philosophy meditation', 'stoic wisdom ancient'];
  } else if (temaLower.includes('paz') || temaLower.includes('serenidad')) {
    return ['calm peaceful nature meditation', 'serene landscape sunrise'];
  } else if (temaLower.includes('proposito') || temaLower.includes('vida')) {
    return ['sunrise horizon purpose life', 'mountain peak success'];
  } else if (temaLower.includes('fuerza') || temaLower.includes('mental')) {
    return ['inner strength mental power', 'confident person walking'];
  } else {
    return ['philosophy wisdom meditation', 'calm focused person thinking'];
  }
}

async function prepareVideoClips(guion, jobId, audioDuration, orientation = 'landscape') {
  const sections = extractKeywords(guion);
  const clipDuration = Math.ceil(audioDuration / sections.length);
  const clipPaths = [];
  const size = orientation === 'portrait' ? '1080:1920' : '1280:720';

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const keyword = section.keywords[0];
    console.log('Buscando video para: ' + keyword);

    try {
      const videoUrl = await searchPexelsVideo(keyword, orientation);
      if (!videoUrl) throw new Error('No video found');

      const rawPath = '/tmp/raw-' + jobId + '-' + i + '.mp4';
      const clipPath = '/tmp/clip-' + jobId + '-' + i + '.mp4';

      await downloadFile(videoUrl, rawPath);

      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -i "' + rawPath + '" -t ' + clipDuration + ' -vf "scale=' + size + ':force_original_aspect_ratio=increase,crop=' + size + '" -c:v libx264 -preset ultrafast -an "' + clipPath + '"',
          (err) => err ? reject(err) : resolve());
      });

      fs.unlinkSync(rawPath);
      clipPaths.push(clipPath);
    } catch(e) {
      console.log('Error con video ' + i + ', usando fondo negro');
      const clipPath = '/tmp/clip-' + jobId + '-' + i + '.mp4';
      const parts = size.split(':');
      const w = parts[0]; const h = parts[1];
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -f lavfi -i color=c=0x0a0a0a:size=' + w + 'x' + h + ':rate=25 -t ' + clipDuration + ' -c:v libx264 -preset ultrafast "' + clipPath + '"',
          (err) => err ? reject(err) : resolve());
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
      if (!videoUrl) throw new Error('No video found');

      const rawPath = '/tmp/raw-' + jobId + '-' + i + '.mp4';
      await downloadFile(videoUrl, rawPath);

      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -i "' + rawPath + '" -t ' + clipDuration + ' -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:v libx264 -preset ultrafast -an "' + clipPath + '"',
          (err) => err ? reject(err) : resolve());
      });

      fs.unlinkSync(rawPath);
      clipPaths.push(clipPath);
    } catch(e) {
      console.log('Error clip short ' + i + ', fondo negro');
      await new Promise((resolve, reject) => {
        exec('ffmpeg -y -f lavfi -i color=c=0x0a0a0a:size=1080x1920:rate=25 -t ' + clipDuration + ' -c:v libx264 -preset ultrafast "' + clipPath + '"',
          (err) => err ? reject(err) : resolve());
      });
      clipPaths.push(clipPath);
    }
  }
  return clipPaths;
}

function generateSubtitles(guion, audioDuration, outputSrt, fontSize) {
  fontSize = fontSize || 18;
  const sentences = guion.match(/[^.!?]+[.!?]+/g) || [guion];
  const timePerSentence = audioDuration / sentences.length;

  let srt = '';
  sentences.forEach(function(sentence, i) {
    const start = i * timePerSentence;
    const end = (i + 1) * timePerSentence;
    const toTime = function(s) {
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

// MAIN VIDEO ENDPOINT
app.post('/render', async (req, res) => {
  const { audioUrl, guion, tema, episodio } = req.body;
  const jobId = Date.now();
  const audioPath = '/tmp/audio-' + jobId + '.mp3';
  const concatFile = '/tmp/concat-' + jobId + '.txt';
  const mergedVideo = '/tmp/merged-' + jobId + '.mp4';
  const srtPath = '/tmp/subs-' + jobId + '.srt';
  const outputPath = '/tmp/video-' + jobId + '.mp4';

  try {
    console.log('Descargando audio...');
    await downloadFile(audioUrl, audioPath);

    const audioDuration = await new Promise((resolve, reject) => {
      exec('ffprobe -i "' + audioPath + '" -show_entries format=duration -v quiet -of csv=p=0',
        (err, stdout) => err ? reject(err) : resolve(parseFloat(stdout.trim())));
    });
    console.log('Duracion audio: ' + audioDuration + 's');

    console.log('Descargando videos de Pexels...');
    const clipPaths = await prepareVideoClips(guion, jobId, audioDuration, 'landscape');

    const concatContent = clipPaths.map(function(p) { return "file '" + p + "'"; }).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c copy "' + mergedVideo + '"',
        (err) => err ? reject(err) : resolve());
    });

    generateSubtitles(guion || tema, audioDuration, srtPath, 18);

    console.log('Generando video final...');
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -i "' + mergedVideo + '" -i "' + audioPath + '" -vf "subtitles=' + srtPath + ':force_style=\'FontSize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Alignment=2\'" -shortest -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 192k "' + outputPath + '"',
        (err, stdout, stderr) => {
          if (err) { console.error(stderr); reject(err); }
          else resolve();
        });
    });

    clipPaths.forEach(function(p) { fs.existsSync(p) && fs.unlinkSync(p); });
    [concatFile, mergedVideo, audioPath, srtPath].forEach(function(p) { fs.existsSync(p) && fs.unlinkSync(p); });

    console.log('Enviando video...');
    res.download(outputPath, 'forjamentaltv-ep' + episodio + '.mp4', function() {
      fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SHORTS ENDPOINT (9:16 vertical)
app.post('/render-short', async (req, res) => {
  const { audioUrl, texto, gancho, tema, episodio, shortNum } = req.body;
  const jobId = Date.now();
  const audioPath = '/tmp/audio-short-' + jobId + '.mp3';
  const concatFile = '/tmp/concat-short-' + jobId + '.txt';
  const mergedVideo = '/tmp/merged-short-' + jobId + '.mp4';
  const srtPath = '/tmp/subs-short-' + jobId + '.srt';
  const outputPath = '/tmp/short-' + jobId + '.mp4';

  try {
    console.log('Generando Short ' + shortNum + ' - EP' + episodio + '...');
    await downloadFile(audioUrl, audioPath);

    const audioDuration = await new Promise((resolve, reject) => {
      exec('ffprobe -i "' + audioPath + '" -show_entries format=duration -v quiet -of csv=p=0',
        (err, stdout) => err ? reject(err) : resolve(Math.min(parseFloat(stdout.trim()), 60)));
    });
    console.log('Duracion short: ' + audioDuration + 's');

    const clipPaths = await prepareShortClips(tema || texto, jobId, audioDuration);

    const concatContent = clipPaths.map(function(p) { return "file '" + p + "'"; }).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -f concat -safe 0 -i "' + concatFile + '" -c copy "' + mergedVideo + '"',
        (err) => err ? reject(err) : resolve());
    });

    const guionShort = texto || gancho || tema;
    generateSubtitles(guionShort, audioDuration, srtPath, 36);

    console.log('Renderizando Short vertical 9:16...');
    const srtEscaped = srtPath.replace(/'/g, "\\'");
    await new Promise((resolve, reject) => {
      exec('ffmpeg -y -i "' + mergedVideo + '" -i "' + audioPath + '" -vf "colormatrix=bt601:bt709,subtitles=\'' + srtEscaped + '\':force_style=\'FontSize=36,FontName=Arial,Bold=1,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=3,Shadow=2,Alignment=10,MarginV=200\',drawtext=text=\'FORJA MENTAL TV\':fontsize=28:fontcolor=0xc9a84c:x=(w-text_w)/2:y=h-100:box=0" -shortest -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -s 1080x1920 "' + outputPath + '"',
        (err, stdout, stderr) => {
          if (err) { console.error(stderr); reject(err); }
          else resolve();
        });
    });

    clipPaths.forEach(function(p) { fs.existsSync(p) && fs.unlinkSync(p); });
    [concatFile, mergedVideo, audioPath, srtPath].forEach(function(p) { fs.existsSync(p) && fs.unlinkSync(p); });

    console.log('Short ' + shortNum + ' listo.');
    res.download(outputPath, 'forjamentaltv-ep' + episodio + '-short' + shortNum + '.mp4', function() {
      fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DRIVE->YOUTUBE TRANSFER (sin pasar por memoria n8n)
function uploadToYouTube(videoPath, fileSize, uploadUrl) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(videoPath);
    const parsed = new URL(uploadUrl);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize
      }
    };
    const req = https.request(options, (response) => {
      let data = '';
      response.on('data', function(chunk) { data += chunk; });
      response.on('end', function() {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json.id || json.videoId || data);
          } catch(e) { resolve(data); }
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
    console.log('Descargando de Drive: ' + driveFileId);
    await downloadFile(driveUrl, videoPath);

    const fileSize = fs.statSync(videoPath).size;
    console.log('Descargado: ' + Math.round(fileSize / 1024 / 1024) + ' MB');

    console.log('Subiendo a YouTube...');
    const videoId = await uploadToYouTube(videoPath, fileSize, youtubeUploadUrl);

    fs.existsSync(videoPath) && fs.unlinkSync(videoPath);
    console.log('Upload completado. videoId: ' + videoId);
    res.json({ videoId: videoId, success: true });

  } catch (err) {
    console.error(err);
    fs.existsSync(videoPath) && fs.unlinkSync(videoPath);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Servidor Forja Mental TV v3.0 en puerto ' + PORT); });
