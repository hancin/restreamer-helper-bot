const TwitchChannel = require('./Auth').TwitchChannel;
const NightbotChannel = require('./Auth').NightbotChannel;
const moment = require('moment');
async function refresh(client){
    try{
            
        let channels = await client.db.channelList();

        await Promise.all(channels.map(async channel => {
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
        }));

        client.logger.debug("Doing a scheduled interval refresh ....");

        let scheduleUpdates = await client.db.scheduledIntervalList();

        await Promise.all(scheduleUpdates.map(async update => {
            client.logger.debug(`Updating message ${update.messageId}...`)


            try{
                const scheduleCommand = client.commands.get("schedule");
                let needsMaintenance = moment(update.updated).isBefore(moment().startOf('day'));
                console.log(update);
                let isExpired = update.expiresAt && moment(update.expiresAt).isSameOrBefore(moment());
                if(needsMaintenance || isExpired){
                    client.logger.debug(`Message ${update.messageId} is too old and needs to be recycled. ${update.updated}`);
                    
                    let guild = client.guilds.get(update.guild);
                    if(!guild){
                        client.logger.error("Could not find guild "+message[0]);
                        return;
                    }
        
                    let channel = guild.channels.get(update.channelName);
                    if(!channel){
                        client.logger.error("Could not find channel "+message[1]);
                        return;
                    }
        
                    let msg = null;
                    try{ 
                        msg = await channel.fetchMessage(update.messageId);
                        if(!msg || msg.author.id !== client.user.id){
                            client.logger.error("Could not find message or no permissions "+update.messageId);
                            return;
                        }
                        await msg.delete();
                    }catch(err){
                        if(err.stack.indexOf("Unknown Message") !== -1){
                            client.logger.error("Was this message already deleted? "+update.messageId);
                        } else{
                            throw err;
                        }
                    }

                    if(isExpired){
                        client.logger.debug("Expired message will get removed...");
                        client.db.scheduledIntervalRemove(update.messageId);
                    } else {
                        let newMessage = await channel.send("Building the new schedule, this won't take long....");
                        let oldId = update.messageId;
                        update.messageId = newMessage.id;
                        update.updated = new Date().toISOString();
    
                        client.db.scheduledIntervalPut(newMessage.id, update);
                        client.db.scheduledIntervalRemove(oldId);
                    }


                    
                }

                let msg = await scheduleCommand.run(client, [update.guild, update.channelName, update.messageId], update.commandsArgs.split(' '), 3);

                if(needsMaintenance && msg){
                    await msg.react('🔁');
                }
            } catch(err){
                client.logger.error("Error while processing update: "+err.stack);
            }
        }));

        
    }catch(err){
        client.logger.error("Generic error in refresh(): "+err.stack);
    }
}
module.exports = async (client) => {
    await refresh(client);
    setInterval(() => refresh(client), 900 * 1000);
    
}