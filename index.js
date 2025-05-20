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
  Promise.all(req.body.events.map(handleEvent)).then((result) => res.json(result));
});

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return Promise.resolve(null);
  return client.replyMessage(event.replyToken, {
    type: 'text',
    text: `「${event.message.text}」って言ったね！`
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Bot is running on ${port}`));
