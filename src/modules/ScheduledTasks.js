const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
async function refresh(client){
    let channels = await client.db.channelList();

    channels.forEach(async channel => {
        client.logger.debug("Doing a scheduled token refresh....");
        if(channel.twitchRefreshToken){
            let twitch = new TwitchChannel(channel, client);
            if(twitch.needsRefresh()){
                client.logger.debug("Updating twitch token for " + channel.channel);
                await twitch.refresh();
                await client.db.channelPut(channel.channel, Object.assign({}, channel, twitch.save(), {updated: new Date().toISOString()}));

            }
        }
        if(channel.nightbotRefreshToken){
            let nightbot = new NightbotChannel(channel, client);
            if(nightbot.needsRefresh()){
                client.logger.debug("Updating nightbot token for " + channel.channel);
                await nightbot.refresh();
                await client.db.channelPut(channel.channel, Object.assign({}, channel, nightbot.save(), {updated: new Date().toISOString()}));
                
            }
        }
    });

    client.logger.debug("Doing a scheduled interval refresh ....");

    let scheduleUpdates = await client.db.scheduledIntervalList();

    scheduleUpdates.forEach(async update => {
        client.logger.debug(`Updating message ${update.messageId}...`)
        try{
            const scheduleCommand = client.commands.get("schedule");
            await scheduleCommand.run(client, [update.guild, update.channelName, update.messageId], update.commandsArgs.split(' '), 3);
        } catch(err){
            client.logger.error("Error while processing update: "+err.stack);
        }
    });
}
module.exports = async (client) => {
    refresh(client);
    setInterval(() => refresh(client), 900 * 1000);
    
}