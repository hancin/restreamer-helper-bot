const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');
exports.run = async (client, message, [when], level) => {// eslint-disable-line no-unused-vars
    if(message.author.dmChannel){
        message.author.dmChannel.startTyping();
    }
    
    try{
        
    const end = moment().endOf('day').add(3, 'days');
    await message.author.send("Building a list of matches you've signed up for in the next 3 days...");

    const sg = sgPre(client);

    let list = await sg.list(moment().startOf('day').toISOString(), end.toISOString(), 'alttpr', false);

    const discordId = message.author.tag.toLowerCase();
    list = list.filter(x=>x.crews.some(c=>c.allValues.some(staff => staff.discord.toLowerCase() === discordId)));

    console.log(list);

    if(list.length === 0){
        await message.author.send("It looks like you're not signed up for anything right now.");

    }else{
        let finalMessage = "Here's all the sign ups I found! I bolded any entries where you are currently scheduled to do this role.\n";

        for(let ep of list){
            let roles = [];
            ep.crews.forEach(crew => {
                let myself = crew.value.find(staff => staff.discord.toLowerCase() === discordId);
                if(!myself){
                    myself = crew.allValues.find(staff => staff.discord.toLowerCase() === discordId);
                }
                if(!myself){
                    return;
                }

                roles.push(myself.approved? `**${crew.name}**` : crew.name);

            });

            finalMessage += `\n\`[${moment(ep.when).format('ddd MMM DD, hh:mm A')}] ${ep.playerInfo.nameText}\`: ${roles.join(", ")}`;
        }

        finalMessage += `\n\n Thank you for volunteering! ♥`;

        await message.author.send(finalMessage);
        
    }

    await message.react("✅");

    } catch(err){
        client.logger.error("Error in mysignups: " + err.stack);
    }   
    
    if(message.author.dmChannel){
        message.author.dmChannel.stopTyping();
    }
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: false,
    aliases: [],
    permLevel: "User"
  };
  
  exports.help = {
    name: "mysignups",
    category: "Crew",
    description: "Gives you information about matches you signed up for the ALTTP Randomizer tourny.",
    usage: "mysignups"
  };
  