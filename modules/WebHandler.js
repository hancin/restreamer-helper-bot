const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();

const whitelistedChannelPatterns = ["hanci", "alttprandomizer"];


module.exports = (client) => {
    
    app.get('/auth/nightbot', function (req, res){
        NightbotChannel.getLoginUrl().then(x=>res.redirect(x));
    });
    app.get('/auth/twitch', function (req, res){
        TwitchChannel.getLoginUrl().then(x=>res.redirect(x));
    });
    app.get('/auth/twitch/callback', function (req, res) {
        TwitchChannel.completeLogin(req.originalUrl, client)
        .then(channel => {
            if(!whitelistedChannelPatterns.some(x=>channel.channelLower.indexOf(x) !== -1)){
                client.logger.warn(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
                return res.send(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
            }

            return res.send(`Channel ${channel.channel} added to database.`);
        });

    });
        
    https.createServer({
        key: fs.readFileSync('./server.key'),
        cert: fs.readFileSync('./server.cert')
    }, app)
    .listen(3000, function(){
        client.logger.log('Server operating at https://localhost:3000/.');
    });

}