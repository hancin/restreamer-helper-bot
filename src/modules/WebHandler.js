const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
const express = require('express');
const https = require('https');
const fs = require('fs');
const moment = require('moment');
const sgPre = require('./SpeedGaming');
const app = express();

const whitelistedChannelPatterns = ["hanci", "alttprandomizer"];


module.exports = (client) => {
    const sg = sgPre(client);
    app.use(express.static('src/public'));
    app.set("view engine", "pug");
    app.get('/schedule/:when', async (req, res) => {

        let baseTime = req.params.when;

        
        if(baseTime && baseTime.toLowerCase() == "yesterday"){
            baseTime = moment().subtract(1, "day").startOf('day').format();
        }
        if(baseTime && baseTime.toLowerCase() == "today"){
            baseTime = moment().startOf('day').format();
        }
        if(baseTime && baseTime.toLowerCase() == "tomorrow"){
            baseTime = moment().add(1, "day").startOf("day").format();
        }
        if(!moment(baseTime).isValid()){
            baseTime = new Date();
        }

        let list = await sg.list(moment(baseTime).startOf('day').format(), moment(baseTime).endOf('day').format(), 'alttpr');


        console.log(list);

        let event = "alttpr";
        if(list.length > 0){
            event = list[0].event.name;
        }

        let alttprList = sg.filterAlttprMatches(list);
        let sgList = sg.filterSgMatches(list);
        let otherList = sg.filterOtherMatches(list);

        return res.render("schedule", {
            title : `Schedule for ${event} on ${moment(baseTime).format('LL')}.`,
            sgEp: sgList,
            alttprEp: alttprList,
            otherEp: otherList
        });
    });

    app.get('/auth/nightbot', function (req, res){
        NightbotChannel.getLoginUrl().then(x=>res.redirect(x));
    });
    app.get('/auth/twitch', function (req, res){
        TwitchChannel.getLoginUrl().then(x=>res.redirect(x));
    });
    app.get('/auth/twitch/callback', async (req, res) => {
        try{
            let channel = await TwitchChannel.completeLogin(req.originalUrl, client);

            if(!whitelistedChannelPatterns.some(x=>channel.channelLower.indexOf(x) !== -1)){
                client.logger.warn(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
                return res.send(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
            }else{
                client.logger.debug(`Channel ${channel.channel} is whitelisted, trying to add to database.`);
            }

            await channel.ensureHasId();

            let record = await client.db.channelGet(channel.channel);

            if(!record) {
                record = client.db.channelNew();
            }

            let mergedRecord = Object.assign({}, record, channel.save(), {updated: new Date().toISOString()});
            await client.db.channelPut(mergedRecord.channel, mergedRecord);

            return res.send(`Channel ${channel.channel} added to database.`);
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            client.logger.error(`Error while doing auth: ${errorMsg}`);
            return res.send("We're sorry, but an error occured. Please contact the maintainer.");
        }

    });
    app.get('/auth/nightbot/callback', async (req, res) => {
        try{
            let channel = await NightbotChannel.completeLogin(req.originalUrl, client);

            if(!whitelistedChannelPatterns.some(x=>channel.channelLower.indexOf(x) !== -1)){
                client.logger.warn(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
                return res.send(`Channel ${channel.channel} not whitelisted, cannot add to database.`);
            }else{
                client.logger.debug(`Channel ${channel.channel} is whitelisted, trying to add to database.`);
            }

            await channel.ensureHasCommands();

            let record = await client.db.channelGet(channel.channel);

            if(!record) {
                record = client.db.channelNew();
            }

            let mergedRecord = Object.assign({}, record, channel.save(), {updated: new Date().toISOString()});
            await client.db.channelPut(mergedRecord.channel, mergedRecord);

            return res.send(`Channel ${channel.channel} added to database.`);
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            client.logger.error(`Error while doing auth: ${errorMsg}`);
            return res.send("We're sorry, but an error occured. Please contact the maintainer.");
        }

    });

    if(app.get('env') === "development"){
        https.createServer({
            key: fs.readFileSync('./server.key'),
            cert: fs.readFileSync('./server.cert')
        }, app)
        .listen(3000, function(){
            client.logger.log('Server operating at https://localhost:3000/.');
        });
    
    }else{
        app.listen(3000, function(){
            client.logger.log('Server operating at http://localhost:3000/.');
        });
    }
        
}