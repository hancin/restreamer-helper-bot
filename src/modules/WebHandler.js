const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
const express = require('express');
const https = require('https');
const fs = require('fs');
const moment = require('moment');
const sgPre = require('./SpeedGaming');
const app = express();

const whitelistedChannelPatterns = ["hanci", "alttprandomizer"];

function overlaps(t1Start, t2Start, t1End, t2End){
    return t1Start.isSameOrBefore(t2End) && t1End.isSameOrAfter(t2Start);
}

module.exports = (client) => {
    const sg = sgPre(client);
    app.use(express.static('src/public'));
    app.set("view engine", "pug");
    app.get('/schedule/:what/:when', async (req, res) => {

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

        let event = req.params.what;

        let list = await sg.list(moment(baseTime).startOf('day').add(181, 'minutes').format(), moment(baseTime).endOf('day').add(181, 'minutes').format(), event);
        if(list.length > 0){
            event = list[0].event.name;
        }

        let alttprList = sg.filterAlttprMatches(list);
        let sgList = sg.filterSgMatches(list);
        let otherList = [...sg.filterOtherMatches(list), ...sgList.filter(x=>!x.primaryChannel)];
        sgList = sgList.filter(x=>x.primaryChannel);

        //First, we flatten all crew availables into a giant single massive array.

        let allCrew = list.reduce((out, current) => {
            return [...out, 
             ...current.crews[0].allValues.map(x=> Object.assign({}, x, {match: current.playerInfo.nameText, start: moment(current.when), end: moment(current.when).add(current.length-5, 'minutes'), duration: current.length, role: "commentator"})),
             ...current.crews[1].allValues.map(x=> Object.assign({}, x, {match: current.playerInfo.nameText, start: moment(current.when), end: moment(current.when).add(current.length-5, 'minutes'), duration: current.length, role: "tracker"})),
             ...current.crews[2].allValues.map(x=> Object.assign({}, x, {match: current.playerInfo.nameText, start: moment(current.when), end: moment(current.when).add(current.length-5, 'minutes'), duration: current.length, role: "restreamer"}))
            ];
            
        }, []);

        //Then, we reduce this mess into an availability per person
        let crewAvailability = allCrew.reduce((out, current) => {
            if(!out[current.name]){
                out[current.name] = {
                    isBusy: false,
                    availability: [], 
                    smartAvailability: [],
                    shifts: [],
                    all: []
                };
            }

            out[current.name].isBusy = out[current.name].isBusy || current.approved;
            out[current.name].all.push(current);
            if(current.approved){
                out[current.name].shifts.push(current);
                //New confirmed shift - delete conflicting possibilities
                out[current.name].availability = out[current.name].availability.filter(avail => !overlaps(avail.start, current.start, avail.end, current.end));
            //Only add availability that doesn't kill scheduled options    
            }else if(!out[current.name].shifts.some(shift => overlaps(shift.start, current.start, shift.end, current.end))){

                out[current.name].availability.push(current);


            }

            return out;
        }, {});

        let scheduleAvailability = {};

        //Now the goal is to build an array of people and their availability for a role for a time period.
        Object.keys(crewAvailability).forEach(name => {
            let person = crewAvailability[name];

            person.availability.forEach(avail => {
                let overlappingItem = person.smartAvailability.find(x=>overlaps(x.start, avail.start, x.end, avail.end) && x.role === avail.role);

                if(!overlappingItem){
                    person.smartAvailability.push(avail);
                }else{
                    overlappingItem.start = moment.min(moment(avail.start), moment(overlappingItem.start)); 
                    overlappingItem.end = moment.max(moment(avail.end), moment(overlappingItem.end)); 
                }

                let start = moment(avail.start).utc().format();
                if(!scheduleAvailability[start]){
                    scheduleAvailability[start] = {commentator: {}, tracker: {}, restreamer: {}};
                }
                if(!scheduleAvailability[start][avail.role][name]){
                    scheduleAvailability[start][avail.role][name] = {
                        // Ugly hack to make sure we get unique matches
                        preferredMatches: Array.from(new Set([...person.shifts.map(x=>x.match), ...person.availability.map(x=>x.match)])),
                        isUnique: person.shifts.length === 0 && person.availability.length === 1,
                        isSingleMatch: person.shifts.length === 0 && person.availability.every(a => a.match === avail.match),
                        shifts: person.shifts.length,
                        signups: person.availability.length
                    };
                }

            });
            
        });

        return res.render("schedule", {
            title : `Schedule for ${event} on ${moment(baseTime).format('LL')}.`,
            sgEp: sgList,
            alttprEp: alttprList,
            otherEp: otherList,
            crewAvailability: crewAvailability,
            scheduleAvailability: scheduleAvailability
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