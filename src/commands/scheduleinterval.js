
const moment = require('moment');
exports.run = async (client, message, [action, messageId, channel, ...args], level) => {// eslint-disable-line no-unused-vars
    try{
    
        if(!action || (action === "add" && (!messageId || !channel))){
            await message.reply("All parameters are required. See `help scheduleinterval` for details.");
            await message.react("❌");
            return;
        }

        if(action !== "add" && action !== "remove" && action !== "list" && action !== "rollover"){
            await message.reply("`action` must be add, remove, list or rollover.");
            await message.react("❌");
            return;
        }

        if(!message.guild){
            await message.reply("This command must be ran in a guild.");
            await message.react("❌");
            return;
        }

        if(action === "list" || (action === "remove" && (!messageId || !channel))){
            const intervals = await client.db.scheduledIntervalList();
            const filteredIntervals = intervals.filter(x=>x.guild == message.guild.id);

            let text = "";
            for(let i=0;i<filteredIntervals.length;i++){
                let m = filteredIntervals[i];
                text += `\n ${i+1}: ${m.messageId}, in channel <#${m.channelName}>, with command \`schedule ${m.commandsArgs}\`, last changed at ${m.updated}.`;
            }

            if(action === "list" && filteredIntervals.length === 0){
                text += "\n No active intervals found.";
            }


            let code = '';
            if(action === "list"){
                await message.reply(`Here's a list of active intervals: ${code}${text}${code}`);
                await message.react("✅");
                return;
            }else{
                text += `\n ${filteredIntervals.length+1}: Do not change anything.`;
                const reply = await client.awaitReply(message, `Please pick which interval you want to remove: ${code}${text}${code}`);
                let intReply = parseInt(reply);
                if(intReply && !isNaN(intReply) && intReply > 0 && intReply <= filteredIntervals.length){
                    messageId = filteredIntervals[intReply -1].messageId;
                    channel = '<#'+filteredIntervals[intReply -1].channelName+'>';
                }else{
                    await message.reply("Cancelled by user, not removing anything.");
                    return;
                }
            }
        }

        else if (action === "rollover") {
            let when = messageId || "tomorrow";
            let replaceWord = "today";
            const intervals = await client.db.scheduledIntervalList();
            const filteredIntervals = intervals.filter(x=>x.guild == message.guild.id);

            for(const update of filteredIntervals){
                
    
                let channel = message.guild.channels.get(update.channelName);
                if(!channel){
                    client.logger.error("Could not find channel "+message[1]);
                    return;
                }

                let newMessage = await channel.send("The new schedule will appear here shortly.");

                let replace = update;
                replace.expiresAt = moment().add(24, 'hours').startOf('day').format();
                replace.commandsArgs = replace.commandsArgs.replace(replaceWord, when);

                await client.db.scheduledIntervalPut(newMessage.id, replace);

            }

            return;
        }



        const channelMention = new RegExp(`^<#!?([0-9]+)>$`);
        const matches = channel.match(channelMention);
        if(!matches){
            await message.reply("The channel parameter must be a channel mention.");
            await message.react("❌");
            return;
        }

        const channelData = message.guild.channels.get(matches[1]);

        if(!channelData){
            await message.reply("The specified channel doesn't exist, or I don't have access to it.");
            await message.react("❌");
            return;
        }

        

        let msg = messageId === "new" ? await channelData.send("This is a placeholder message, we'll update this in a moment.") : await channelData.fetchMessage(messageId);
        
        if(!msg){
            await message.reply("The specified message doesn't exist, or I couldn't post to that channel.");
            await message.react("❌");
            return;
        }

        if(messageId === "new"){
            messageId = msg.id;
        }

        if(action === "remove"){
            const item = await client.db.scheduledIntervalGet(messageId);
            if(item === null){
                await message.reply("Could not find a scheduled interval for this message.");
                await message.react("❌");
                return;
            }

            await client.db.scheduledIntervalRemove(messageId);
            await Promise.all(
                msg.reactions.filter(x=>x.me)
                .map(x=>x.remove())
            );
        }else{
            const item = (await client.db.scheduledIntervalGet(messageId)) || client.db.scheduledIntervalNew();

            let finalItem = Object.assign({}, item, {
                updated: new Date().toISOString(),
                messageId: messageId,
                guild: message.guild.id,
                channelName: matches[1],
                requester: message.author.username,
                requesterMessageId: level,
                commandsArgs: args.join(" ") 
            });

            await client.db.scheduledIntervalPut(messageId, finalItem);

            await msg.react("🔁");

            let scheduleCommand = client.commands.get("schedule");
            await scheduleCommand.run(client, [message.guild.id, matches[1], messageId], args, 3);

        }


        await message.react("✅");





    }catch(err){
        await message.reply("An error occured while preparing scheduleinterval: " +err.stack);
    }
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: true,
    aliases: [],
    permLevel: "Moderator"
  };
  
  exports.help = {
    name: "scheduleinterval",
    category: "Restreaming",
    description: "Set a bot post to be updated every 15 minutes with the schedule command listed.",
    usage: "scheduleinterval <add/remove/list/rollover> <messageID/new> <channel> <other parameters passed to schedule>"
  };
  