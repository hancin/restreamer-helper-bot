const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');
function showRestreamers(x,i, expectedCrew){
    if(expectedCrew[i] === 0){
        return '';
    }
    return `Restreamers: ${x.crews[2].value.map(c=>c.discord).join(', ')} ${crewExtra(x,i,expectedCrew)}
    `;
}
function crewExtra(x,i,expectedCrew){
    let text = `(+${x.crews[i].count-x.crews[i].value.length})`;

    if(x.crews[i].count-x.crews[i].value.length <= 0){
        text = "";
    }

    if(x.crews[i].value.length < expectedCrew[i]){
        text += " 👀";
    }else{
        text = "";
    }

    return text;
}
exports.run = async (client, message, args, level) => {// eslint-disable-line no-unused-vars
    try{
        let sg = sgPre(client);
        let baseTime = args[0] || "today";
        let target = args[1] || "alttpr";
        let messageID = args[2] || null;

        let msg;
        if(messageID !== null){
            msg = await message.channel.fetchMessage(messageID);
            if(msg === null || msg.author.id !== client.user.id){
                await message.react('❌');
                return;
            }
        }else{
            
            msg = await message.reply("Building schedule, please wait....");
        }

        if(args[0] === "needs"){
            baseTime = "today";
            target = "needs";
        }


        if(target != "alttpr" && target != "all" && target != "sg" && target !== "needs"){
            target = "alttpr";
        }
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


        let list = await sg.list(moment(baseTime).startOf('day').format(), moment(baseTime).endOf('day').add(181, 'minutes').format(), 'alttpr');

        let selected = [];

        if(target === "sg") {
            selected = sg.filterSgMatches(list);
        }else if(target === "alttpr"){
            selected = sg.filterAlttprMatches(list);
        }else if(target === "all" || target === "needs"){
            selected = sg.filteredDisplayedMatches(list);
        }
        let fields = [];
        let description = (target === "needs") ? "Check below to see what crew we currently need!" : "Here's what we know about the schedule so far.";

        description += `  __(Updated ${moment().format('ddd, hh:mmA')})__`;
        
        if(target !== "needs"){
            fields = selected.map(x=> { 
                let expectedCrew = [2, x.playerInfo.value.length > 2? 2:1, x.channelName.indexOf("SpeedGaming")!== -1 ? 0: 1];
                return {
                    name: `**${moment(x.when).format('LT')}** | __${x.playerInfo.nameText}__`,
                    value: `ID: ${x.id} | [${x.channelName}](https://twitch.tv/${x.channelName})
                    Commentators: ${x.crews[0].value.map(c=>c.discord).join(', ')} ${crewExtra(x,0,expectedCrew)}
                    Trackers: ${x.crews[1].value.map(c=>c.discord).join(', ')} ${crewExtra(x,1,expectedCrew)}
                    ${showRestreamers(x,2,expectedCrew)} _${x.variations}_`
                }
            });
        } else {
            var needsObject = [{name: "Commentary", text: "commentator", value: {}}, 
            {name: "Tracking", text: "tracker", value: {}}, {name: "Restreaming", text:"restreamer", value: {}}];

            selected.forEach((ep) => {
                let expectedCrew = [2, ep.playerInfo.value.length > 2? 2:1, ep.channelName.indexOf("SpeedGaming")!== -1 ? 0: 1];
                
                for(let i=0;i<3;i++){
                    let timeKey = moment(ep.when).format("h:mm A");
                    if(ep.crews[i].value.length < expectedCrew[i]){
                        needsObject[i].value[timeKey] = (needsObject[i].value[timeKey] || 0) + expectedCrew[i] - ep.crews[i].value.length;
                    }
                }

            });

            needsObject.forEach((section) => {
                let times = Object.keys(section.value);
                let values = times.map((t) => `${t} - ${section.value[t]} ${section.text}${section.value[t] !== 1?'s':''}`);

                if(!values || values.length === 0){
                    values = ["We're all set!"];
                }
                
                fields.push({
                    name: `**__${section.name} - ${moment(baseTime).format("dddd, MMMM Do")}__**`,
                    value: values.join("\n")
                });
            });
        }

        if(fields.length === 0){
            fields.push({
                name: "No matches found",
                value: "There were no matches on schedule for your request."
            });
        }

        msg.edit({embed: {
            color: 0xFFF0E0,
            author: {
                name: client.user.username,
                icon_url: client.user.avatarURL
            },
            title: `Schedule information for ${moment(baseTime).format('ll')}`,
            description: description,
            fields: fields
        }});

        if(messageID !== null){
            message.react('✅');
        }
    }catch(err){
        await message.reply("An error occured while loading schedule: " +err.stack);
    }
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: false,
    aliases: [],
    permLevel: "Moderator"
  };
  
  exports.help = {
    name: "schedule",
    category: "Restreaming",
    description: "Shows the published ALTTPR schedule for the specified date. If messageID is specified, update that post instead of creating a new one. Shortcuts 'schedule' for today's schedule and 'schedule needs' for today's needs.",
    usage: "schedule <yesterday/TODAY/tomorrow/YYYY-MM-DD> <alttpr/sg/ALL/needs> <messageID>"
  };
  