const express = require('express');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

app.post('/render', async (req, res) => {
  const { audioUrl, guion, tema, episodio } = req.body;

  try {
    const bundleLocation = await bundle({
      entryPoint: path.resolve('./src/index.js'),
      webpackOverride: (config) => config,
    });

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'ForjaMentalTV',
      inputProps: { audioUrl, guion, tema, episodio },
    });

    const outputPath = `/tmp/video-${episodio}.mp4`;

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: { audioUrl, guion, tema, episodio },
    });

    const videoBuffer = fs.readFileSync(outputPath);
    res.set('Content-Type', 'video/mp4');
    res.send(videoBuffer);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Forja Mental TV en puerto ${PORT}`));
