const vision = require('@google-cloud/vision');
const fs = require('fs'); 
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: './vision-key.json'
});

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
app.use(express.json()); 
app.use(middleware(config));

const client = new Client(config);

app.post('/webhook', (req, res) => {
  console.log("✅ Webhook受信:", JSON.stringify(req.body, null, 2));  
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("❌ イベント処理中にエラー:", err);
      res.status(500).end();
    });
});

function handleEvent(event) {
  console.log("📨 イベント詳細:", JSON.stringify(event, null, 2));
  if (event.type !== 'message') return Promise.resolve(null);

  // 位置 QuickReply
  if (event.message.type === 'text' && event.message.text === '位置') {
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "近くのおすすめを紹介します！\n現在地を送ってください📍",
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "location",
              label: "現在地を送る"
            }
          }
        ]
      }
    });
  }

  // 画像処理（Vision APIでランドマーク検出）
  if (event.message.type === 'image') {
    const messageId = event.message.id;

    return client.getMessageContent(messageId)
      .then((stream) => {
        return new Promise((resolve, reject) => {
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', async () => {
            try {
              const imageBuffer = Buffer.concat(chunks);
              console.log("✅ 画像バッファ取得完了:", imageBuffer.length, "bytes");

              const [result] = await visionClient.landmarkDetection({ image: { content: imageBuffer } });
              const landmarks = result.landmarkAnnotations;

              if (landmarks.length > 0) {
                const landmark = landmarks[0];
                const name = landmark.description;
                const location = landmark.locations[0]?.latLng;

                let replyText = `この写真は「${name}」っぽいですね！📍`;
                if (location) {
                  replyText += `\n緯度: ${location.latitude}, 経度: ${location.longitude}`;
                  replyText += `\n地図: https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
                }

                await client.replyMessage(event.replyToken, {
                  type: 'text',
                  text: replyText
                });
              } else {
                await client.replyMessage(event.replyToken, {
                  type: 'text',
                  text: 'ごめんね、場所を特定できなかったよ🌀'
                });
              }

              resolve(); // 最後に完了
            } catch (err) {
              console.error("❌ Vision API エラー:", err);
              await client.replyMessage(event.replyToken, {
                type: 'text',
                text: '画像の解析に失敗しました…😢'
              });
              resolve();
            }
          });
          stream.on('error', reject);
        });
      })
      .catch((err) => {
        console.error("❌ 画像取得エラー:", err);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像の取得に失敗しました…もう一度送ってもらえますか？'
        });
      });
  }

  // 通常のテキスト返信（オウム返し）
  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `「${event.message.text}」って言ったね！`
    });
  }

  return Promise.resolve(null);
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot is running on ${port}`));
