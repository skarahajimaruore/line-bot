require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const vision = require('@google-cloud/vision');

// 先頭付近に仮追加（あとで削除してOK）
console.log('▶︎ GAC env :', process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('▶︎ exists?  :',
  require('fs').existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '<<<undefined>>>'));


/* ---------- Google Cloud Vision ---------- */
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error('❌ GOOGLE_APPLICATION_CREDENTIALS が未設定、またはパスが無効です:', keyPath);
  process.exit(1);
}
const visionClient = new vision.ImageAnnotatorClient({ keyFilename: keyPath });

/* ---------- LINE Bot 設定 ---------- */
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.LINE_CHANNEL_SECRET
};
const client = new Client(config);

/* ---------- Express アプリ ---------- */
const app = express();
app.get('/', (_, res) => res.sendStatus(200));           // Health-check

app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('❌ イベント処理中にエラー:', err);
    res.status(500).end();
  }
});

/* ---------- イベントハンドラ ---------- */
async function handleEvent(event) {
  if (event.type !== 'message') return null;

  // 位置情報クイックリプライ
  if (event.message.type === 'text' && event.message.text === '位置') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '近くのおすすめを紹介します！\n現在地を送ってください📍',
      quickReply: {
        items: [{ type: 'action', action: { type: 'location', label: '現在地を送る' } }]
      }
    });
  }

  // 画像メッセージ
  if (event.message.type === 'image') {
    return handleImage(event);
  }

  // オウム返し
  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `「${event.message.text}」って言ったね！`
    });
  }

  return null;
}

/* ---------- 画像処理 ---------- */
async function handleImage(event) {
  try {
    const stream = await client.getMessageContent(event.message.id);
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', c => chunks.push(c));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const [result] = await visionClient.landmarkDetection({ image: { content: Buffer.concat(chunks) } });
    const lm = result.landmarkAnnotations?.[0];
    if (!lm) {
      return client.replyMessage(event.replyToken, { type: 'text', text: 'ごめんね、場所を特定できなかったよ🌈' });
    }

    const loc = lm.locations[0]?.latLng;
    let reply = `この写真は「${lm.description}」っぽいですね！📍`;
    if (loc) {
      reply += `\n緯度: ${loc.latitude}, 経度: ${loc.longitude}`;
      reply += `\n地図: https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
    }
    return client.replyMessage(event.replyToken, { type: 'text', text: reply });

  } catch (err) {
    console.error('❌ Vision API エラー:', err);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '画像の解析に失敗しました…😢'
    });
  }
}

/* ---------- サーバ起動 ---------- */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot is running on ${port}`));
