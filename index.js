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
  Promise.all(req.body.events.map(handleEvent)).then((result) => res.json(result));
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
    const filePath = `./images/${messageId}.jpg`;

    return client.getMessageContent(messageId)
      .then((stream) => {
        return new Promise((resolve, reject) => {
          const writable = fs.createWriteStream(filePath);
          stream.pipe(writable);
          stream.on('end', () => {
            console.log(`✅ 画像を保存しました: ${filePath}`);
            resolve();
          });
          stream.on('error', reject);
        });
      })
      .then(() => {
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像を受け取りました！📸\nありがとうございます。'
        });
      })
      .catch((err) => {
        console.error("❌ 画像保存エラー:", err);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像の保存に失敗しました…もう一度送ってもらえますか？'
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
