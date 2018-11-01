const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');

exports.run = async (client, message, args, level) => {// eslint-disable-line no-unused-vars
    try{
        let sg = sgPre(client);
        const msg = await message.reply("Building schedule, please wait....");
        let baseTime = args[0] || "today";
        let target = args[1] || "all";

        if(args[0] === "needs"){
            baseTime = "today";
            target = "needs";
        }


        if(target != "alttpr" && target != "all" && target != "sg" && target !== "needs"){
            target = "all";
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
        
        if(target !== "needs"){
            fields = selected.map(x=> { return {
                name: `**${moment(x.when).format('LT')}** | __${x.playerInfo.nameText}__`,
                value: `ID: ${x.id} | [${x.channelName}](https://twitch.tv/${x.channelName})
                Commentators: ${x.crews[0].value.map(c=>c.discord).join(', ')} (+${x.crews[0].count-x.crews[0].value.length})
                Trackers: ${x.crews[1].value.map(c=>c.discord).join(', ')} (+${x.crews[1].count-x.crews[1].value.length})
                Restreamers: ${x.crews[2].value.map(c=>c.discord).join(', ')} (+${x.crews[2].count-x.crews[2].value.length})
                _${x.variations}_`
            }});
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
    description: "Shows the published ALTTPR schedule for the specified date.",
    usage: "schedule <yesterday/today/tomorrow/YYYY-MM-DD> <alttpr/sg/all/needs>"
  };
  