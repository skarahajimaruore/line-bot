// =======================================================
// LINE × Cloud Vision Bot  ― 修正済み完全版
// ・ファイルパス方式で鍵ファイルを読む
// ・LINE 署名検証を壊さないミドルウェア順序
// ・Render のヘルスチェック用ルートを追加
// =======================================================

require('dotenv').config();
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const vision = require('@google-cloud/vision');

// ---------- Google Cloud Vision クライアント ----------
// .env 例:  GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json'
});

// ---------- LINE Bot 設定 ----------
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.LINE_CHANNEL_SECRET
};
const client = new Client(config);

// ---------- Express アプリ ----------
const app = express();

/**
 * Health Check 用 (Render が / をポーリングするため)
 * これが無くても動くが、ログが綺麗になる
 */
app.get('/', (_, res) => res.sendStatus(200));

/**
 * Webhook
 * 1. middleware(config) で署名を検証
 * 2. 署名 OK なリクエストだけ通す
 */
app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error('❌ イベント処理中にエラー:', err);
    res.status(500).end();
  }
});

// ---------- イベント処理 ----------
async function handleEvent(event) {
  console.log('📨 受信イベント:', JSON.stringify(event, null, 2));

  if (event.type !== 'message') return null;

  // --- 位置情報リクエスト ---
  if (event.message.type === 'text' && event.message.text === '位置') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '近くのおすすめを紹介します！\n現在地を送ってください📍',
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'location', label: '現在地を送る' }
          }
        ]
      }
    });
  }

  // --- 画像メッセージ：ランドマーク検出 ---
  if (event.message.type === 'image') {
    return handleImage(event);
  }

  // --- テキスト：オウム返し ---
  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `「${event.message.text}」って言ったね！`
    });
  }

  return null;
}

// ---------- 画像処理関数 ----------
async function handleImage(event) {
  try {
    const stream     = await client.getMessageContent(event.message.id);
    const chunks     = [];
    await new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const imageBuffer = Buffer.concat(chunks);
    console.log('✅ 画像バッファ取得:', imageBuffer.length, 'bytes');

    const [result]   = await visionClient.landmarkDetection({ image: { content: imageBuffer } });
    const landmarks  = result.landmarkAnnotations;

    if (landmarks.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'ごめんね、場所を特定できなかったよ🌈'
      });
    }

    const lm        = landmarks[0];
    const name      = lm.description;
    const location  = lm.locations[0]?.latLng;

    let reply = `この写真は「${name}」っぽいですね！📍`;
    if (location) {
      reply += `\n緯度: ${location.latitude}, 経度: ${location.longitude}`;
      reply += `\n地図: https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
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

// ---------- サーバ起動 ----------
const port = process.env.PORT || 3000; // Render では自動で 10000 が入る
app.listen(port, () => console.log(`Bot is running on ${port}`));
