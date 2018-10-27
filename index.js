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
    ['!mode', 'The settings for this match are $(variations). See more information on these settings at https://alttpr.com/options !'],
]);

var nightbotAuth = new clientOAuth2({
    clientId: config.nightbotClientId,
    clientSecret: config.nightbotClientSecret,
    accessTokenUri: 'https://api.nightbot.tv/oauth2/token',
    authorizationUri: 'https://api.nightbot.tv/oauth2/authorize',
    redirectUri: process.env.NIGHTBOT_CALLBACK_URI || 'https://localhost:3000/auth/nightbot/callback',
    scopes: ["channel", "commands"]
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


// TODO: Actually save the tokens from the auth workflow
var nightbotUserToken = null;

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
    
    .then(fullInfo => {
        console.log(fullInfo);
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

/**
 * The goal of this function is to map channel names to twitch channel IDs
 * so we can later update title and get status.
 */
async function updateTwitchIds(){
    try{
        let docs = await documentClient.scan({TableName: tableName}).promise();

        var channels = [...overrideChannels, ...docs.Items.map(x=>x.channel)];

        console.log(channels);

        let userInfo = await fetch("https://api.twitch.tv/kraken/users?login="+channels.join(","), {
            headers: twitchHeaders
        });

        let json = await userInfo.json();

        json.users.forEach(user => {
            channelMap.set(user.display_name, user._id);
        });

        channelMap.set("hancin", "177910405");

        console.log(channelMap);
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
        return [isOnline, isOnline? json.stream.status : null];
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
    return fetch(`https://api.twitch.tv/kraken/user`, updateForTwitch(user.sign({headers: twitchHeaders})))
    .then(response => response.json())
    .then(json => {
        console.log(json);
        if(!json || json.status !== 200 || !json.name){
            console.log(`Please check this channel response? ${json}`);
            return Promise.reject("Cannot register channel, because the response was invalid.");
        }
        let messages = [];

        let name = json.name;
        if(!expectedChannels.some(x => name.indexOf(x) !== -1)){
            console.log(`Invalid: ${name}`);
            return Promise.reject("Cannot register channel, because the channel is not whitelisted.");
        }

        log(messages, (`Detected that you want to add the bot to channel ${name}. This channel name is whitelisted`));
        return Promise.resolve({
            channel: name,
            twitchUser: user,
            messages: messages
        });
    });
}

function validateChannel(user){
    return fetch(`${nightBotApiBase}/channel`, user.sign({}))
    .then(response => response.json())
    .then(json => {
        if(json.status !== 200 || !json.channel || !json.channel.name){
            console.log(`Please check this channel response? ${json}`);
            return Promise.reject("Cannot register channel, because the response was invalid.");
        }
        let messages = [];

        let name = json.channel.name;
        if(!expectedChannels.some(x => name.indexOf(x) !== -1)){
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
        accessToken: channelInfo.user.accessToken,
        refreshToken: channelInfo.user.refreshToken,
        expiresAt: channelInfo.user.expires,
        commands: channelInfo.commands,
        updated: new Date().toISOString()
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

        nightbotUserToken = channelInfo.user;
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


        var isOnline = await isTwitchChannelOnline(channel.name);

        if(isOnline && !override){
            data.success = false;
            data.needsConfirmation = true;
            data.confirmationType = "channel-online";
            return data;
        }

        data.success = true;
        data.episode = episode;
    }
    catch(e){
        if(e === 404 || e.error){
            data.success = false;
            data.errorType = "not-found";
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

    if (command === "ping") {
        // Calculates ping between sending a message and editing it, giving a nice round-trip latency.
        // The second ping is an average latency between the bot and the websocket server (one-way, not round-trip)
        const m = await message.channel.send("Ping?");
        m.edit(`Pong! Latency is ${m.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(self.ping)}ms`);
    }

    if(command === "commands") {
        if(!message.member.roles.some(n=>n.name === "Admins") && !message.member.roles.some(n=>n.name === "Mods")){
            message.react('📛');
        }else{
            const result = await updateCommands(args[0], false);
    
            if(result.success){
                message.react('✅');
            }else if(result.needsConfirmation){
                message.react('⚠');
                switch(result.confirmationType){
                    case "channel-online":
                        await message.channel.send(`The channel your race is currently on is currently online, so the commands cannot be updated right now. A moderator can override this by using \`$confirmCommands ${args[0]}\``);
                        break;
                    default:
                        await message.channel.send(`Needs confirmation: ${result.confirmationType}`);
                        break;
                }
            }else{
                message.react('❌');
                if(result.errorType === "not-found"){
                    await message.channel.send(`Could not find episode ${args[0]}.`);
                }else if(result.errorType === "invalid-channel"){
                    await message.channel.send(`Cannot update commands because this bot cannot update the channel. Please notify the moderators if this is an error.`);
                }else if(result.errorType === "not-approved"){
                    await message.channel.send(`This match has not been approved. Please notify the moderators if this is an error.`);
                }else if(result.errorType === "no-channel"){
                    await message.channel.send(`This match does not have a broadcast channel. Please notify the moderators if this is an error.`);
                }
            }
        }
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