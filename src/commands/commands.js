const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');
const TwitchChannel = require('../modules/Auth').TwitchChannel;
const NightbotChannel = require('../modules/Auth').NightbotChannel;

function templateReplace(template, episode){
    return template
        .replace(`$(${episode.crews[0].variable})`, episode.crews[0].streamText)
        .replace(`$(${episode.crews[1].variable})`, episode.crews[1].streamText)
        .replace(`$(${episode.crews[2].variable})`, episode.crews[2].streamText)
        .replace(`$(${episode.playerInfo.variable})`, episode.playerInfo.streamText)
        .replace(`$(${episode.crews[0].variable2})`, episode.crews[0].nameText)
        .replace(`$(${episode.crews[1].variable2})`, episode.crews[1].nameText)
        .replace(`$(${episode.crews[2].variable2})`, episode.crews[2].nameText)
        .replace(`$(${episode.playerInfo.variable2})`, episode.playerInfo.nameText)
        .replace(`$(name)`, episode.event.name)
        .replace(`$(variations)`, episode.variations);
}

async function updateCommands(id, override, client, sg){
    var data = {};
    try{
        let episode = await sg.get(id);

        if(episode === null){
            data.success = false;
            data.errorType = "not-found";
            return data;
        }
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

        if(!episode.channelName || episode.channelName.indexOf('ALTTPRandomizer') === -1){
            data.success = false;
            data.errorType = "invalid-channel";
            return data;
        }

        let channelInfo = await client.db.channelGet(episode.channelName);
        if(!channelInfo || !channelInfo.twitchAccessToken || !channelInfo.nightbotAccessToken){
            data.success = false;
            data.errorType = "no-channel-data";
            return data;
        }

        let twitchChannel = new TwitchChannel(channelInfo, client);
        let nightbotChannel = new NightbotChannel(channelInfo, client);

        var [isOnline, title] = await twitchChannel.getOnlineStatus();

        if(isOnline && !override){
            /* End-users can still update when online if the title mentions all the runners in the schedule */
            var passedTitleCheck = true;
            if(episode.playerInfo.value){
                passedTitleCheck = episode.playerInfo.value.every(x=>title.indexOf(x.name) !== -1);
            }
            if(passedTitleCheck){
                client.logger.warn("The channel was online but the correct players were found in the title. Allowing...");
            }else{
                data.success = false;
                data.needsConfirmation = true;
                data.confirmationType = "channel-online";
                return data;
            }
        }

        if(!moment(episode.when).isBetween(
                moment().subtract(6, "hours").startOf("hour"), 
                moment().add(6, "hours").endOf("hour")
            ) && !override){
            data.success = false;
            data.needsConfirmation = true;
            data.confirmationType = "wrong-timing";
            return data;
        }

        const commandMap = new Map([
            ['!c', 'Thanks to our volunteers! Commentary: $(commentators) // Tracking: $(trackers) // Restream: $(restreamers)'],
            ['!r', 'Enjoying the race? Follow the runners! $(players)'],
            ['!mode', 'The settings for this match are $(variations). See more information on these settings at https://alttpr.com/options ! Find out what the symbols mean at https://i.imgur.com/cec8yKj.png'],
        ]);
        const titleTemplate = "$(name). $(playerNames). !alttpr for info, !mode for settings";


        try{
            let promises = [
                twitchChannel.setTitle(templateReplace(titleTemplate, episode))
            ]

            for(let [key, value] of commandMap){
               promises.push(nightbotChannel.updateCommand(key, templateReplace(value, episode)));
            }

            const results = await Promise.all(promises);
            var succeeded = results.every(r=>r);

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
            data.success = false;
            data.errorType = "update-error";
            return data;
        }
    }
    catch(e){
        if(e === 404 || e.error){
            data.success = false;
            data.errorType = "not-found";
        }else{
            data.success = false;
            data.errorType = "unknown. " + e.stack;
            client.logger.error(e.stack);
        }
    }

    return data;


}

exports.run = async (client, message, args, level) => {// eslint-disable-line no-unused-vars
    let sg = sgPre(client);
    
    let override = args[1] === "force" && level >= 2;

    if(args[1] === "force" && level < 2){
        try{
            await message.react('📛');
        } catch(err){
            await message.reply("📛 This override requires you to be a moderator, so I can't run it for you.");
        }
        return;
    }

    const result = await updateCommands(args[0] || 0, override, client, sg);

    if(result.success){
        try{
            await message.react('✅');
        } catch(err){
            await message.reply("It looks like I can't react to you here but I just wanted to tell you everything's alright ✅");
        }
    }else if(result.needsConfirmation){
        try{
            await message.react('⚠');
        } catch(err){
            await message.reply("It looks like I can't react to you here but I just wanted to something's not quite right ⚠. Check my next message below for details");
        }
        switch(result.confirmationType){
            case "channel-online":
                await message.channel.send(`The channel your race is currently on is currently online, so the commands cannot be updated right now. A moderator can override this by using \`$commands ${args[0]} force\``);
                break;
            case "wrong-timing":
                await message.channel.send(`This episode is not scheduled to run in the next or previous six hours. Are you sure you've got the right match?  A moderator can override this by using \`$commands ${args[0]} force\` `);
                break;
            default:
                await message.channel.send(`Needs confirmation: ${result.confirmationType}`);
                break;
        }
    }else{
        try{
            await message.react('❌');
        } catch(err){
            await message.reply("It looks like I can't react to you, and I'm sorry but I just can't do that right now ❌. Check my next message below for details");
        }
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
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: true,
    aliases: [],
    permLevel: "Power User"
  };
  
  exports.help = {
    name: "commands",
    category: "Restreaming",
    description: "Sets the required commands on one of the alttp channels for the specified episode.",
    usage: "commands <episodeID> <force>"
  };
  