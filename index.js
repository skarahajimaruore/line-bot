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
