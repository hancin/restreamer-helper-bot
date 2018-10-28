const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
async function refresh(client){
    let channels = await client.db.channelList();

    channels.forEach(async channel => {
        client.logger.debug("Doing a scheduled token refresh....");
        if(channel.twitchId){
            let twitch = new TwitchChannel(channel, client);
            if(twitch.needsRefresh()){
                client.logger.debug("Updating twitch token for " + channel.channel);
                await twitch.refresh();
                await client.db.channelPut(channel.channel, Object.assign({}, channel, twitch.save(), {updated: new Date().toISOString()}));

            }
        }
        if(channel.nightbotId){
            let nightbot = new NightbotChannel(channel, client);
            if(nightbot.needsRefresh()){
                client.logger.debug("Updating nightbot token for " + channel.channel);
                await nightbot.refresh();
                await client.db.channelPut(channel.channel, Object.assign({}, channel, nightbot.save(), {updated: new Date().toISOString()}));
                
            }
        }
    });
}
module.exports = async (client) => {
    refresh(client);
    setInterval(() => refresh(client), 900 * 1000);
    
}