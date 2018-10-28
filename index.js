'use strict';

const discord = require('discord.js');
const self = new discord.Client();

const express = require('express');
const https = require('https');
const fetch = require('node-fetch');
const fs = require('fs');
const app = express();
const clientOAuth2 = require('client-oauth2');
const AWS = require('aws-sdk');
const moment = require('moment');


const tableName = process.env.TABLE_NAME || "TrackedChannels"

AWS.config.update({
    region: 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
});


const dynamodb = new AWS.DynamoDB();

var params = {
    TableName: tableName,
    KeySchema: [
        { AttributeName: "channel", KeyType: "HASH"}
    ],
    AttributeDefinitions: [
        { AttributeName: "channel", AttributeType: "S"}
    ],
    ProvisionedThroughput: {
        ReadCapacityUnits: 10,
        WriteCapacityUnits: 10
    }
};

dynamodb.createTable(params, function(err, data){
    if (err) {
        console.error("Unable to create table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        console.log("Created table. Table description JSON:", JSON.stringify(data, null, 2));
    }
});
const documentClient = new AWS.DynamoDB.DocumentClient();

// Here we load the config.json file that contains our token and our prefix values. 
const config = require("./config.json");
const nightBotApiBase = "https://api.nightbot.tv/1";
// config.token contains the bot's token
// config.prefix contains the message prefix.

const commandMap = new Map([
    ['!c', 'Thanks to our volunteers! Commentary: $(commentators) // Tracking: $(trackers) // Restream: $(restreamers)'],
    ['!r', 'Enjoying the race? Follow the runners! $(runners)'],
    ['!mode', 'The settings for this match are $(variations). See more information on these settings at https://alttpr.com/options ! Find out what the symbols mean at https://i.imgur.com/cec8yKj.png'],
]);
let titleTemplate = "$(name). $(runnerNames). !alttpr for info, !mode for settings";

var nightbotAuth = new clientOAuth2({
    clientId: config.nightbotClientId,
    clientSecret: config.nightbotClientSecret,
    accessTokenUri: 'https://api.nightbot.tv/oauth2/token',
    authorizationUri: 'https://api.nightbot.tv/oauth2/authorize',
    redirectUri: process.env.NIGHTBOT_CALLBACK_URI || 'https://localhost:3000/auth/nightbot/callback',
    scopes: ["commands"]
});

var twitchAuth = new clientOAuth2({
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
    accessTokenUri: 'https://id.twitch.tv/oauth2/token',
    authorizationUri: 'https://id.twitch.tv/oauth2/authorize',
    redirectUri: process.env.TWITCH_CALLBACK_URI || 'https://localhost:3000/auth/twitch/callback',
    scopes: ["channel_editor"]
});

const twitchHeaders = {"Client-ID": config.twitchClientId, "Accept": "application/vnd.twitchtv.v5+json"};

// This is the expected channel patterns this bot should register to.
var expectedChannels = ['hancin', 'alttprandomizer'];

var overrideChannels = ["ALTTPRandomizer", "ALTTPRandomizer2", "ALTTPRandomizer3", "ALTTPRandomizer4", "ALTTPRandomizer5"];


let channelMap = new Map();

app.get('/auth/nightbot', function (req, res){
    var uri = nightbotAuth.code.getUri();
    res.redirect(uri);
});
app.get('/auth/twitch', function (req, res){
    var uri = twitchAuth.code.getUri();
    res.redirect(uri);
});

app.get('/auth/nightbot/callback', function (req, res) {
    console.log('Login request received from Nightbot');
    nightbotAuth.code.getToken(req.originalUrl)
    .then(validateChannel)
    .then(detectCommands)
    .then(updateChannelDb)
    .then(fullInfo => {
        return res.send(fullInfo.messages.join("<br />"));
    })
    .catch(function(err){
        console.log(err);
        return res.send(err);
    });
});

app.get('/auth/twitch/callback', function (req, res) {
    console.log('Login request received from Twitch');
    twitchAuth.code.getToken(req.originalUrl, {body: {"client_id": config.twitchClientId, "client_secret": config.twitchClientSecret}})
    .then(validateTwitchChannel)
    .then(updateChannelDb)
    .then(fullInfo => {
        return res.send(fullInfo.messages.join("<br />"));
    })
    .catch(function(err){
        console.log(err);
        return res.send(err);
    });
});

function log(array, message){
    array.push(message);
    console.log(message);
}

setInterval(updateTwitchIds, 1000 * 3600);
updateTwitchIds();
setInterval(updateAccessTokens, 1000 * 900);
updateAccessTokens();

/**
 * The goal of this function is to map channel names to twitch channel IDs
 * so we can later update title and get status.
 */
async function updateTwitchIds(){
    try{
        let docs = await documentClient.scan({TableName: tableName}).promise();

        var channels = [...overrideChannels, ...docs.Items.map(x=>x.channel)];

        let userInfo = await fetch("https://api.twitch.tv/kraken/users?login="+channels.join(","), {
            headers: twitchHeaders
        });

        let json = await userInfo.json();

        json.users.forEach(user => {
            channelMap.set(user.display_name, user._id);
        });

    } catch (e) {
        console.log(e);
    }


}

async function updateAccessTokens(){
    try{
        let docs = await documentClient.scan({TableName: tableName}).promise();

        for(var i = 0; i< docs.Items.length;i++){
            let channel = docs.Items[i];

            console.log(channel.channel, "nightbot", moment(channel.expiresAt).fromNow());
            if(channel.expiresAt 
                && moment(channel.expiresAt).isBefore(moment().add(30, "minutes"))
            ){
                console.log("this nb token needs a refresh");
                let nbToken = nightbotAuth.createToken(channel.accessToken, channel.refreshToken, 'bearer');
                nbToken.expiresIn(new Date(channel.expiresAt));

                nbToken.refresh().then(token => {
                    console.log(token);
                    updateChannelDb({
                        channel: channel.channel,
                        messages: [],
                        user: token
                    });
                })
            }

            console.log(channel.channel, "twitch", moment(channel.twitchExpiresAt).fromNow());
            if(channel.twitchExpiresAt 
                && moment(channel.twitchExpiresAt).isBefore(moment().add(30, "minutes"))
            ){
                console.log("this twitch token needs a refresh");
                let twitchToken = twitchAuth.createToken(channel.twitchAccessToken, channel.twitchRefreshToken, 'bearer');
                twitchToken.expiresIn(new Date(channel.twitchExpiresAt));

                twitchToken.refresh({body: {"client_id": config.twitchClientId, "client_secret": config.twitchClientSecret}}).then(token => {
                    console.log(token);
                    updateChannelDb({
                        channel: channel.channel,
                        messages: [],
                        twitchUser: token
                    });
                })
            }
        }

    } catch (e) {
        console.log(e);
    }
}

async function isTwitchChannelOnline(channel){
    try{    
        if(!channelMap.has(channel)){
            await updateTwitchIds();
        }
        if(!channelMap.has(channel)){
            console.log(`Skipping online verification because I don't have the ID for channel ${channel}`);
            return [false, null];
        }
        var response = await fetch("https://api.twitch.tv/kraken/streams/" + channelMap.get(channel), {headers: twitchHeaders});
        var json = await response.json();
        console.log(json);
        var isOnline = json.stream !== null;
        return [isOnline, isOnline? json.stream.channel.status : null];
    }catch(e){
        console.log(`Error while doing verification:`, e);
        return [false, null];
    }
}

function updateForTwitch(params){
    params.headers['Authorization'] = params.headers['Authorization'].replace('Bearer', 'OAuth');
    return params;
}
function validateTwitchChannel(user){
    
    console.log(updateForTwitch(user.sign({headers: twitchHeaders})));
    return fetch(`https://api.twitch.tv/kraken`, updateForTwitch(user.sign({headers: twitchHeaders})))
    .then(response => response.json())
    .then(json => {
        if(!json || !json.token || !json.token.valid || !json.token.user_name){
            console.log(`Please check this channel response?`, json);
            return Promise.reject("Cannot register channel, because the response was invalid.");
        }
        let messages = [];

        let name = json.token.user_name;
        if(!expectedChannels.some(x => name.toLowerCase().indexOf(x) !== -1)){
            console.log(`Invalid: ${name}`);
            return Promise.reject("Cannot register channel, because the channel is not whitelisted.");
        }

        log(messages, (`Detected that you want to add the bot to channel ${name}. This channel name is whitelisted`));

        channelMap.set(name, json.token.user_id);

        return Promise.resolve({
            channel: name,
            twitchUser: user,
            messages: messages
        });
    });
}

function validateChannel(user){
    return fetch(`${nightBotApiBase}/me`, user.sign({}))
    .then(response => response.json())
    .then(json => {
        if(!json || !json.user || !json.user.displayName || json.user.provider !== "twitch"){
            console.log(`Please check this channel response? ${json}`);
            return Promise.reject("Cannot register channel, because the response was invalid.");
        }
        let messages = [];

        let name = json.user.displayName;
        if(!expectedChannels.some(x => name.toLowerCase().indexOf(x) !== -1)){
            console.log(`Invalid: ${name}`);
            return Promise.reject("Cannot register channel, because the channel is not whitelisted.");
        }

        log(messages, (`Detected that you want to add the bot to channel ${name}. This channel name is whitelisted`));
        return Promise.resolve({
            channel: name,
            user: user,
            messages: messages
        });
    });
}

function updateChannelDb(channelInfo){
    var existing = documentClient.get({TableName: tableName, Key: { channel: channelInfo.channel }}).promise();

    console.log(channelInfo.user);
    let sanitizedData = {
        channel: channelInfo.channel,
        updated: new Date().toISOString()
    }
    if(channelInfo.user){
        sanitizedData.accessToken = channelInfo.user.accessToken;
        sanitizedData.refreshToken = channelInfo.user.refreshToken;
        sanitizedData.expiresAt = channelInfo.user.expires.toISOString();
    }
    if(channelInfo.commands){
        sanitizedData.commands = channelInfo.commands;
    }
    if(channelInfo.twitchUser){
        sanitizedData.twitchAccessToken = channelInfo.twitchUser.accessToken;
        sanitizedData.twitchRefreshToken = channelInfo.twitchUser.refreshToken;
        sanitizedData.twitchExpiresAt = channelInfo.twitchUser.expires.toISOString();
    }
    console.log(sanitizedData);

    let channelData;

    return existing
    .then(data => {
        if(!data.Item){
            log(channelInfo.messages, `This is a channel not previously in the DB. Creating it...`);
            channelData = Object.assign({}, sanitizedData);
        }else {
            log(channelInfo.messages, `This channel already exists in the DB, updating...`);
            channelData = Object.assign({}, data.Item, sanitizedData);
        }

        if(!channelData.created){
            channelData.created = new Date().toISOString();
        }

        return documentClient.put({TableName: tableName, Item: channelData}).promise();
    })
    .then(data =>{
        log(channelInfo.messages, `Channel ${channelData.channel} added to DB.`);

        return Promise.resolve(channelInfo);
    });

}

function detectCommands(channelInfo){
    return fetch(`${nightBotApiBase}/commands`, channelInfo.user.sign({}))
    .then(response => response.json())
    .then(json => {
        if(json.status !== 200){
            console.log(`Please check this command response? ${json}`);
            return Promise.reject("Cannot register channel, because the response was invalid.");
        }

        channelInfo.commands = {};

        for(let [name, defaultText] of commandMap){
            var customCommand = json.commands.find(x => x.name === name);
            if(customCommand){
                log(channelInfo.messages, `Command ${name} exists with ID ${customCommand._id}. Adding to registry.`);
                channelInfo.commands[name] = customCommand._id;

            }else{
                log(channelInfo.messages, `Command ${name} wasn't found. You'll need to create it then register the channel again.`);
            }
            
        }

        return Promise.resolve(channelInfo);
    });
}

function parsePlayer(entry){
	let runner = {
		name: entry.displayName,
		stream: entry.publicStream,
		discord: entry.discordTag
	}

	if(runner.stream === '')
		runner.stream = entry.displayName;

	return runner;
}

function prettifyEpisode(episode){
    let result = "";
    let name = "";
    if(episode.channels.length > 0){
        var isAlttpr = (episode.channels && episode.channels.some(c => expectedChannels.some(e=>c.name.toLowerCase().indexOf(e)) !== -1));
        var channel = episode.channels && episode.channels[0];
        name += "**"+moment(episode.when).format('LT')+"** | ";

        name += "__"
        if(episode.match1 && episode.match1.players){
            name += episode.match1.players.map(parsePlayer).map(x=>x.name).join(" vs ")
        }
        if(episode.match2 && episode.match2.players){
            name += " and " + episode.match2.players.map(parsePlayer).map(x=>x.name).join(" vs ")
        }
        name += "__";
        result += "ID: "+episode.id+" | ["+channel.name+"](https://twitch.tv/"+channel.name+")";
        result += "\n Commentators: ";

        let commentators = episode.commentators.filter(x=>x.approved).map(parsePlayer).map(x=>x.discord);
        let commSignups = episode.commentators.length - commentators.length;
        result += commentators.join(", ");
        if(commentators.length < 2){
            result += ` (+${commSignups} signups)`;
        }

        result +=" \n Trackers: ";
        let trackers = episode.trackers.filter(x=>x.approved).map(parsePlayer).map(x=>x.discord);
        let trackSignups = episode.trackers.length - trackers.length;
        result += trackers.join(", ");
        if(trackers.length < 1){
            result += ` (+${trackSignups} signups)`;
        }

        if(isAlttpr){
            result +=" \n Restreamers: ";
            let broadcasters = episode.broadcasters.filter(x=>x.approved).map(parsePlayer).map(x=>x.discord);
            let bcSignups = episode.broadcasters.length - broadcasters.length;
            result += "**"+ broadcasters.join(", ")+"**";
            if(broadcasters.length < 1){
                result += ` (+${bcSignups} signups)`;
            }
        }

        result += "\n    _"+episode.match1.title+"_";



    }

    return {name: name, value: result};
}

async function getSchedule(baseTime){
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
        baseTime = null;
    }
    let episodes = await fetch(`${config.sgApi}/schedule/?from=${moment(baseTime).startOf('day').format()}&to=${moment(baseTime).endOf('day').format()}&event=alttpr`).then(r=>r.json());
    console.log(episodes);
    let alttpr = episodes.filter(m => m.approved && (m.channels && m.channels.some(c => expectedChannels.some(e=>c.name.toLowerCase().indexOf(e) !== -1))));
    let sg = episodes.filter(m => m.approved && (m.channels && m.channels.some(c => c.name.toLowerCase().indexOf("speedgaming") !== -1)));

    console.log(alttpr);

    let alttprText = alttpr.map(prettifyEpisode);
    let sgText = sg.map(prettifyEpisode);

    if(!alttprText){
        alttprText = "No matches assigned on schedule yet.";
    }
    if(!sgText){
        sgText = "Nothing on SG.";
    }

    var embed = {
        color: 0xFFF0E0,
        author: {
            name: self.user.username,
            icon_url: self.user.avatarURL
        },
        title: `Schedule information for ${moment(baseTime).format('ll')}`,
        description: "Here's what we know about the schedule so far.",
        fields: [
            ...alttprText
        ]
    }

    return embed;
}

async function updateCommands(id, override){

    var data = {};
    try{
        let episode = await fetchEpisode(id);

        if(!episode.approved){
            data.success = false;
            data.errorType = "not-approved";
            return data;
        }
        if(!episode.channels || episode.channels.length === 0){
            data.success = false;
            data.errorType = "no-channel";
            return data;
        }

        var channel = episode.channels.find(x => x.slug.indexOf("alttpr") === 0);

        if(!channel){
            data.success = false;
            data.errorType = "invalid-channel";
            return data;
        }

        //TEMP change for testing.
        channel.name = "hancin";

        let channelInfo = await documentClient.get({TableName: tableName, Key: {channel: channel.name}}).promise();
        
        if(!channelInfo.Item || !channelInfo.Item.channel || !channelInfo.Item.twitchAccessToken || !channelInfo.Item.accessToken){
            data.success = false;
            data.errorType = "no-channel-data";
            return data;
        }


        var [isOnline, title] = await isTwitchChannelOnline(channel.name);

        if(isOnline && !override){
            /* End-users can still update when online if the title mentions all the runners in the schedule */
            var passedTitleCheck = true;
            if(episode.match1 && episode.match1.players){
                passedTitleCheck = episode.match1.players.every(x=>title.indexOf(x.displayName)!==-1);
            }
            if(passedTitleCheck && episode.match2 && episode.match2.players){
                passedTitleCheck = episode.match2.players.every(x=>title.indexOf(x.displayName)!==-1);
            }
            if(passedTitleCheck){
                console.log("The channel was online but the correct players were found in the title. Allowing...");
            }else{
                data.success = false;
                data.needsConfirmation = true;
                data.confirmationType = "channel-online";
                return data;
            }
        }

        if(!moment(episode.when).isBetween(moment().subtract(6, "hours").startOf("hour"), moment().add(6, "hours").endOf("hour")) && !override){
            data.success = false;
            data.needsConfirmation = true;
            data.confirmationType = "wrong-timing";
            return data;
        }

        let promises = [];
        let players = [];
        let commentators = [];
        let broadcasters = [];
        let trackers = [];
        let variations = "";

        if(episode.match1 && episode.match1.players){
            variations = episode.match1.title;
            players.push(...episode.match1.players.map(parsePlayer));
        }
        if(episode.match2){
            players.push(...episode.match2.players.map(parsePlayer));
        }
        if(episode.trackers){
            trackers.push(...episode.trackers.filter(x=>x.approved).map(parsePlayer));
        }
        if(episode.commentators){
            commentators.push(...episode.commentators.filter(x=>x.approved).map(parsePlayer));
        }
        if(episode.broadcasters){
            broadcasters.push(...episode.broadcasters.filter(x=>x.approved).map(parsePlayer));
        }

        console.log(channelInfo);
        let user = nightbotAuth.createToken(channelInfo.Item.accessToken, channelInfo.Item.refreshToken, 'bearer');
        user.expiresIn(new Date(channelInfo.Item.expiresAt));

        for(let [key, value] of commandMap){


            let actualCommand = value.replace("$(commentators)", commentators.map(x=>`twitch.tv/${x.stream}`).join(" & "))
            .replace("$(runners)", players.map(x=>"twitch.tv/" + x.stream).join(" & "))
            .replace("$(trackers)", trackers.map(x=>"twitch.tv/" + x.stream).join(" & "))
            .replace("$(restreamers)", broadcasters.map(x=>"twitch.tv/" + x.stream).join(" & "))
            .replace("$(variations)", variations);
            console.log(channelInfo.Item.commands[key]);
            if(channelInfo.Item.commands[key]){
                console.log(user.sign({
                    method: "PUT",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: "message="+encodeURIComponent(actualCommand)
                }));
                promises.push(fetch(`${nightBotApiBase}/commands/${channelInfo.Item.commands[key]}`, user.sign({
                    method: "PUT",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body: "message="+encodeURIComponent(actualCommand)
                })));
            }else{
                console.log('Not updating command because it doesn\'t exist', key)
            }

        }

        let twitchUser = twitchAuth.createToken(channelInfo.Item.twitchAccessToken, channelInfo.Item.twitchRefreshToken, 'bearer');
        twitchUser.expiresIn(new Date(channelInfo.Item.twitchexpiresAt));
        console.log(updateForTwitch(twitchUser.sign({
            method: 'PUT',
            headers: {"Content-Type": "application/x-www-form-urlencoded", ...twitchHeaders},
            body: "status=" + encodeURIComponent(titleTemplate.replace("$(runnerNames)", players.map(x=>x.name).join(" vs ")).replace("$(name)", episode.event.name))
        })));
        promises.push(fetch(`https://api.twitch.tv/kraken/channels/${channelMap.get(channel.name)}`, 
            updateForTwitch(twitchUser.sign({
                method: 'PUT',
                headers: {"Content-Type": "application/x-www-form-urlencoded", ...twitchHeaders},
                body: "channel[status]=" + encodeURIComponent(titleTemplate.replace("$(runnerNames)", players.map(x=>x.name).join(" vs ")).replace("$(name)", episode.event.name))
            }))
        ));

        try{
            var results = await Promise.all(promises);
            var succeeded = results.every(r=>r.status===200);
            var actualInfo = await Promise.all(results.map(x=>x.json()));
            console.log(actualInfo);

            if(succeeded){
                data.success = true;
                data.episode = episode;
            }else{
                data.success = false;
                data.errorType = "update-error";
                console.log('Error updating channels, responses:', results);
            }
            
        } catch (e){
            console.log('Error updating channels, responses:', e.stack);
        }

    }
    catch(e){
        if(e === 404 || e.error){
            data.success = false;
            data.errorType = "not-found";
        }else{
            data.success = false;
            data.errorType = "unknown. " + e.stack;
        }
    }

    return data;
}

function fetchEpisode(id){
    return fetch(`${config.sgApi}/episode?id=${id}`)
    .then(response => response.json())
    .then(json => {
        if(!json || json.error){
            console.log(json.error);
            return Promise.reject(404);
        }

        console.log(json);
        return Promise.resolve(json);
    })
    .catch(err =>{
        console.log(err);
        return Promise.reject(404);
    });
}

app.get('/channels', function (req, res){
    documentClient.scan({TableName: tableName}).promise()
    .then(data=>{
        console.log(data.Items);
        return res.send("List obtained and put in console.");
    });
});




self.on("ready", () => {
    // This event will run if the bot starts, and logs in, successfully.
    console.log(`Bot has started, with ${self.users.size} users, in ${self.channels.size} channels of ${self.guilds.size} guilds.`);
    // Example of changing the bot's playing game to something useful. `client.user` is what the
    // docs refer to as the "ClientUser".
    self.user.setActivity(`Serving ${self.guilds.size} servers`);
});

self.on("guildCreate", guild => {
    // This event triggers when the bot joins a guild.
    console.log(`New guild joined: ${guild.name} (id: ${self.id}). This guild has ${self.memberCount} members!`);
    self.user.setActivity(`Serving ${self.guilds.size} servers`);
});

self.on("guildDelete", guild => {
    // this event triggers when the bot is removed from a guild.
    console.log(`I have been removed from: ${guild.name} (id: ${guild.id})`);
    self.user.setActivity(`Serving ${self.guilds.size} servers`);
});

self.on("message", async message => {
    // This event will run on every single message received, from any channel or DM.

    // It's good practice to ignore other bots. This also makes your bot ignore itself
    // and not get into a spam loop (we call that "botception").
    if (message.author.bot) return;

    // Also good practice to ignore any message that does not start with our prefix, 
    // which is set in the configuration file.
    if (message.content.indexOf(config.prefix) !== 0) return;

    // Here we separate our "command" name, and our "arguments" for the command. 
    // e.g. if we have the message "+say Is this the real life?" , we'll get the following:
    // command = say
    // args = ["Is", "this", "the", "real", "life?"]
    const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    try{
        if(command === "schedule"){
            if(!message.member.roles.some(n=>n.name === "Admins") //Admins - always allowed
            && !message.member.roles.some(n=>n.name === "Mods")){

            }else{
                let result = await getSchedule(args.length === 0? moment().format() : args[0]);
                await message.channel.send({embed: result});
            }
        }
        if(command === "commands" || command === "confirmcommands") {
            if(!message.member.roles.some(n=>n.name === "Admins") //Admins - always allowed
            && !message.member.roles.some(n=>n.name === "Mods")  //Mods - always allowed
            && !(message.member.roles.some(n=>n.name === "Restreamers") && command === "commands")){ //Restreamers - allow the non-override version only
                message.react('📛');
            }else{
                const result = await updateCommands(args[0], command === "confirmcommands");
        
                if(result.success){
                    message.react('✅');
                }else if(result.needsConfirmation){
                    message.react('⚠');
                    switch(result.confirmationType){
                        case "channel-online":
                            await message.channel.send(`The channel your race is currently on is currently online, so the commands cannot be updated right now. A moderator can override this by using \`$confirmcommands ${args[0]}\``);
                            break;
                        case "wrong-timing":
                            await message.channel.send(`This episode is not scheduled to run in the next or previous six hours. Are you sure you've got the right match?  A moderator can override this by using \`$confirmcommands ${args[0]}\` `);
                            break;
                        default:
                            await message.channel.send(`Needs confirmation: ${result.confirmationType}`);
                            break;
                    }
                }else{
                    message.react('❌');
                    switch(result.errorType){
                        case "not-found":
                            await message.channel.send(`Could not find episode ${args[0]}.`);
                            break;
                        case "invalid-channel":
                            await message.channel.send(`Cannot update commands because this bot cannot update the channel. Please notify the moderators if this is an error.`);
                            break;
                        case "not-approved":
                            await message.channel.send(`This match has not been approved. Please notify the moderators if this is an error.`);
                            break;
                        case "no-channel":
                            await message.channel.send(`This match does not have a broadcast channel. Please notify the moderators if this is an error.`);
                            break;
                        case "no-channel-data":
                            await message.channel.send(`I cannot update this channel yet. Please notify the moderators if this is an error.`);
                            break;
                        case "update-error":
                            await message.channel.send(`I cannot update the channel due to an API error. Please contact the moderators.`);
                            break;
                        default:
                            await message.channel.send(`Could not complete due to an error: ${result.errorType}`);
                            break;
                    }
                }
            }
        }
    } catch(e){
        message.channel.send(`An error occured: `+e.stack);
    }
});

self.login(config.token);

https.createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
}, app)
.listen(3000, function(){
    console.log('Server operating at https://localhost:3000/.');
});