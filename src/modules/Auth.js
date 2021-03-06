const config = require('../../cfg/config.js');
const clientOAuth2 = require('client-oauth2');
const moment = require('moment');
const Enmap = require('enmap');
const fetch = require('node-fetch');


const nightbotAuth = new clientOAuth2(config.nightbot);
const twitchAuth = new clientOAuth2(config.twitch);
const channelMap = new Enmap({name: "channelCache"});


exports.TwitchChannel = class TwitchChannel{

    constructor(data, client){
        this.client = client;
        this.channel = data.channel;
        if(data.channel){
            this.channelLower = data.channel.toLowerCase();
        }else{
            this.channelLower = data.channel;
        }
        
        if(data.token){
            this.token = data.token;
        }else{
            this.token = twitchAuth.createToken(data.twitchAccessToken, data.twitchRefreshToken, 'bearer');
            this.token.expiresIn(new Date(data.twitchExpiresAt))
        }

    }

    static async sendTwitchRequest(url, options = {}){
        const mergedOptions = Object.assign({}, options);
        if(options.headers){
            mergedOptions.headers = Object.assign({}, {
                "Client-ID": config.twitch.clientId, 
                "Accept": "application/vnd.twitchtv.v5+json"
            }, options.headers);
        }else{
            mergedOptions.headers = {
                "Client-ID": config.twitch.clientId, 
                "Accept": "application/vnd.twitchtv.v5+json"
            };
        }

        if(mergedOptions.headers.Authorization)
            mergedOptions.headers['Authorization'] = mergedOptions.headers['Authorization'].replace('Bearer', 'OAuth');

        let response = await fetch(config.twitch.api + url, mergedOptions);
        let content = await response.json();

        return {response: response, content: content};
    }

    static async getLoginUrl(){
        return twitchAuth.code.getUri();
    }

    static async completeLogin(url, client) {
        try{
            let token = await twitchAuth.code.getToken(url, {body: {"client_id": config.twitch.clientId, "client_secret": config.twitch.clientSecret}});

            let twitchInfo = await this.sendTwitchRequest("", token.sign({}));

            if(!(twitchInfo 
                && twitchInfo.content 
                && twitchInfo.content.token 
                && twitchInfo.content.token.valid
                && twitchInfo.content.token.user_name)){
                    client.logger.error(`Token error`, twitchInfo);
                    return null;
            }

            let channelName = twitchInfo.content.token.user_name;

            return new TwitchChannel({
                channel: channelName,
                token: token
            }, client);

        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while refreshing token: ${errorMsg}`);
            return null;
        }
    }

    static async getTwitchChannelIds(users) {
        let result = await TwitchChannel.sendTwitchRequest("/users?login="+users.join(","));
        if(!result || !result.content || !result.content.users)
            return [];

        return result.content.users.map(item => {
            return {name: item.display_name, id: item._id};
        });
    }

    save() {
        return {
            channel: this.channel,
            twitchId: this.channelId,
            twitchAccessToken: this.token.accessToken,
            twitchRefreshToken: this.token.refreshToken,
            twitchExpiresAt: this.token.expires.toISOString()
        }
    }

    needsRefresh() {
        return moment(this.token.expires).isBefore(moment().add(30, "minutes"));
    }

    async refresh() {
        try{
            this.token = await this.token.refresh({body: {"client_id": config.twitch.clientId, "client_secret": config.twitch.clientSecret}});
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while refreshing token: ${errorMsg}`);
        }

        return this.token;
    }

    /*
    * Determine if we know the channel ID for the twitch API call. 
    */
    async ensureHasId(){
        if(!this.channelId){
            if(channelMap.has(this.channel) && channelMap[this.channel]){
                this.channelId = channelMap.get(this.channel);
            }else{
                let maps = await TwitchChannel.getTwitchChannelIds([this.channel]);
                if(maps.length > 0){
                    channelMap.set(maps[0].name, maps[0].id);
                    this.channelId = maps[0].id;
                }else{
                    this.client.logger.warn(`Could not find channel id for ${this.channel}, please verify`);
                }
            }
        }
    }


    async getOnlineStatus() {
        try{
            await this.ensureHasId();

            let streamInfo = await TwitchChannel.sendTwitchRequest("/streams/" + this.channelId)

            let isOnline = streamInfo.content.stream !== null;
            let title = isOnline ? streamInfo.content.stream.channel.status : null;

            return [isOnline, title];

        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while getting online status: ${errorMsg}`);
            return [false, null];
        }

    }
    
    async setTitle(title){
        try{
            await this.ensureHasId();

            let streamInfo = await TwitchChannel.sendTwitchRequest("/channels/" + this.channelId, this.token.sign({
                method: 'PUT',
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
                body: `channel[status]=${encodeURIComponent(title)}`
            }));
            
            return streamInfo.content.status === title;

        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while setting twitch title: ${errorMsg}`);
            return false;
        }
    }

}

exports.NightbotChannel = class NightbotChannel{
    constructor(data, client){
        this.client = client;
        this.channel = data.channel;
        if(data.channel){
            this.channelLower = data.channel.toLowerCase();
        }else{
            this.channelLower = data.channel;
        }
        this.channelId = data.channelId;
        if(data.token){
            this.token = data.token;
        }else{
            this.token = nightbotAuth.createToken(data.nightbotAccessToken, data.nightbotRefreshToken, 'bearer');
            this.token.expiresIn(new Date(data.nightbotExpiresAt));
        }
        this.commands = new Map();
    }

    
    static async sendNightbotRequest(url, options = {}){
        const mergedOptions = Object.assign({},{ }, options);

        let response = await fetch(config.nightbot.api + url, mergedOptions);
        let content = await response.json();

        return {response: response, content: content};
    }

    static async getLoginUrl(){
        return nightbotAuth.code.getUri();
    }

    static async completeLogin(url, client) {
        try{
            let token = await nightbotAuth.code.getToken(url);
            let nightbotInfo = await this.sendNightbotRequest("/me", token.sign({}));

            if(!(nightbotInfo 
                && nightbotInfo.content
                && nightbotInfo.content.user 
                && nightbotInfo.content.user.displayName)){
                    client.logger.error(`Token error ${nightbotInfo}`);
                    return null;
            }
            let channelName = nightbotInfo.content.user.displayName;
            let channelId = nightbotInfo.content.user._id;

            return new NightbotChannel({
                channel: channelName,
                channelId, channelId,
                token: token
            }, client);

        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            client.logger.error(`Error while obtaining nightbot token: ${errorMsg}`);
            return null;
        }
    }

    save() {
        return {
            channel: this.channel,
            nightbotId: this.channelId,
            nightbotAccessToken: this.token.accessToken,
            nightbotRefreshToken: this.token.refreshToken,
            nightbotExpiresAt: this.token.expires.toISOString()
        }
    }

    needsRefresh() {
        return moment(this.token.expires).isBefore(moment().add(30, "minutes"));
    }

    async refresh() {
        try{
            this.token = await this.token.refresh();
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            client.logger.error(`Error while refreshing token: ${errorMsg}`);
        }

        return this.token;
    }

    async ensureHasCommands() {
        try{
            if(!this.commands || this.commands.size === 0){
                let nbData = await NightbotChannel.sendNightbotRequest("/commands", this.token.sign({}));

                console.log(nbData);

                nbData.content.commands.forEach(command =>{
                    this.commands.set(command.name, command._id);
                });
            }

            return true;
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            client.logger.error(`Error while obtaining nightbot command list: ${errorMsg}`);
            return false;
        }
    }

    async showCommands(){
        try{
            await this.ensureHasCommands();
            return this.commands;
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while obtaining nightbot command list: ${errorMsg}`);
            return [];
        }
    }


    async updateCommand(name, message){
        try{
            await this.ensureHasCommands();

            if(!this.commands.has(name)){
                this.client.logger.error(`Command ${name} not present on channel ${this.channel}.`);
                return false;
            }
            let id = this.commands.get(name);

            let nbData = await NightbotChannel.sendNightbotRequest(`/commands/${id}`, this.token.sign({
                method: 'PUT',
                headers: {"Content-Type": "application/x-www-form-urlencoded"},
                body: `message=${encodeURIComponent(message)}`
            }));

            return nbData.content && nbData.content.command && nbData.content.command.message === message;
        } catch (err){
            const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
            this.client.logger.error(`Error while obtaining nightbot command list: ${errorMsg}`);
            return false;
        }
    }


}