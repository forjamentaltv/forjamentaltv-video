const express = require('express');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    function doRequest(currentUrl) {
      const protocol = currentUrl.startsWith('https') ? https : http;
      protocol.get(currentUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303) {
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

app.post('/render', async (req, res) => {
  const { audioUrl, tema, episodio } = req.body;
  const jobId = Date.now();
  const audioPath = `/tmp/audio-${jobId}.mp3`;
  const outputPath = `/tmp/video-${jobId}.mp4`;

  try {
    // Descargar audio
    console.log('Descargando audio...');
    await downloadFile(audioUrl, audioPath);

    // Generar vídeo con FFmpeg
    console.log('Renderizando vídeo...');
    const ffmpegCmd = `ffmpeg -y \
      -f lavfi -i color=c=0x0a0a0a:size=1280x720:rate=25 \
      -i "${audioPath}" \
      -vf "drawtext=text='FORJA MENTAL TV':fontcolor=0xc9a84c:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-100:font=serif, \
           drawtext=text='${tema.replace(/'/g, '')}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2+20:font=serif, \
           drawtext=text='Episodio ${episodio}':fontcolor=0xc9a84c:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+120:font=serif" \
      -shortest \
      -c:v libx264 -preset ultrafast -crf 28 \
      -c:a aac -b:a 192k \
      "${outputPath}"`;

    await new Promise((resolve, reject) => {
      exec(ffmpegCmd, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Devolver vídeo
    console.log('Enviando vídeo...');
    res.download(outputPath, `forjamentaltv-ep${episodio}.mp4`, () => {
      fs.unlinkSync(audioPath);
      fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error(err);
    fs.existsSync(audioPath) && fs.unlinkSync(audioPath);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Forja Mental TV en puerto ${PORT}`));
