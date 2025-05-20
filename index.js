const fs = require('fs'); 
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');

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

  // まず message でなければ何もしない
  if (event.type !== 'message') return Promise.resolve(null);

  // テキストメッセージのうち、「位置」と送られてきたときだけ QuickReply を返す
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
 // 画像を受け取ったとき
if (event.message.type === 'image') {
  const messageId = event.message.id;

  return client.getMessageContent(messageId)
    .then((stream) => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const imageBuffer = Buffer.concat(chunks);

          // ✅ ここで imageBuffer を使って画像解析・AI連携などできる
          console.log("✅ 画像バッファ取得完了。サイズ:", imageBuffer.length, "bytes");

          // 例：ここにGoogle Cloud Vision API、AWS Rekognitionなどの処理を書く

          // ユーザーに返信
          resolve(client.replyMessage(event.replyToken, {
            type: 'text',
            text: '画像を受け取って解析中です🔍'
          }));
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

  // その他のテキストメッセージ → オウム返し
  if (event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `「${event.message.text}」って言ったね！`
    });
  }

  // テキストでもない場合は何もしない
  return Promise.resolve(null);
}


const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot is running on ${port}`));
