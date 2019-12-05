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
function findUser(u, message, settings){
    let user = message.guild.members.find(x=>x.user.tag == u);
    if(!user){
        if(!settings || settings.showCannotFindError === "1"){
            message.reply(`Cannot find user ${u} in this server. Check SG info?`);
        }
        return u;
    }
    return user.displayName;
}
exports.run = async (client, message, [baseTime, target, messageID], level) => {// eslint-disable-line no-unused-vars
    
    if(!baseTime){
        baseTime = "today";
    }
    if(!target){
        target = "all";
    }



    if(messageID && level < 3){
        message.react("📛");
        return;
    }

    let doReacts = false;
    try{
        let msg;

        let settings;

        if(message.length && message.length === 3){
            let guild = client.guilds.get(message[0]);
            if(!guild){
                client.logger.error("Could not find guild "+message[0]);
                return;
            }

            let channel = guild.channels.get(message[1]);
            if(!channel){
                client.logger.error("Could not find channel "+message[1]);
                return;
            }

            msg = await channel.fetchMessage(message[2]);
            if(!msg || msg.author.id !== client.user.id){
                client.logger.error("Could not find message or no permissions "+message[2]);
                return;
            }

            settings = client.getSettings(guild.id);

        }else{
            doReacts = true;
            settings = message.settings;
        }

        let sg = sgPre(client);

        if(messageID){
            msg = await message.channel.fetchMessage(messageID);
            if(msg === null || msg.author.id !== client.user.id){
                if(doReacts)
                    await message.react('❌');
                else
                    client.logger.error("Could not fetch message "+messageID);
                return;
            }

        }else if(!msg){
            msg = await message.reply("Building schedule, please wait....");
        }

        if(baseTime === "needs"){
            baseTime = "today";
            target = "needs";
        }
        if(baseTime === "notes"){
            baseTime = "today";
            target = "notes";
        }


        if(target != "alttpr" && target != "all" && target != "sg" && target !== "needs" && target !== "full" && target !== "notes"){
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
            baseTime = moment().startOf('day').format();
        }


        let list = await sg.list(moment(baseTime).startOf('day').format(), moment(baseTime).endOf('day').add(181, 'minutes').format(), settings.event);

        let selected = [];

        if(target === "sg") {
            selected = sg.filterSgMatches(list);
        }else if(target === "alttpr"){
            selected = sg.filterAlttprMatches(list);
        }else if(target === "all" || target === "needs" || target === "full"){
            selected = sg.filteredDisplayedMatches(list, settings.showTBD === "1" || settings.showTBD === "true" || settings.showTBD === 1);
        }


        if(target === "notes"){
            let allNotes = await client.db.matchNotesList(Math.min(level, 2));
            selected = allNotes.filter(x=>list.some(l=>l.id === x.episodeId));
            console.log(selected);
        }

        let now = moment();
        
        if(target !== "full" && target !== "notes"){
            selected = selected.filter(x=>moment(x.when).isAfter(now));
        }

        let fields = [];
        let description = (target === "needs") ? "Check below to see what crew we currently need!" : "Here's what we found on the schedule.";

        if(target === "notes"){
            let map = selected.reduce((out, note) => {
                if(!out[note.episodeId]){
                    out[note.episodeId] = [];
                }

                out[note.episodeId].push(note);

                return out;
            }, {});
            console.log(map);

            let controlled = [];

            list.forEach(ep => {
                let notes = map[ep.id] || [];
                if(ep.match1 && ep.match1.note){
                    notes.push({isPlay: true, note: ep.match1.note});
                }
                if(notes.length > 0){
                    controlled.push({name: `**${moment(ep.when).format('LT')}** | __${ep.playerInfo.nameText}__`, value: notes.map(n=> (n.isPlay? "**Players: **": "**Crew: **") + n.note).join("\n")})
                }
            });

            fields = controlled;
        }else if(target !== "needs"){
            fields = selected.map(x=> { 
                let setupText = settings.showSetupTime ? `
                _Setup starts *${moment(x.when).subtract(settings.setupTimeSubtract, 'minutes').format('LT')}*_` : '';
                let expectedCrew = [2, x.playerInfo.value.length > 2? 2:1, !x.channelName || x.channelName.indexOf("SpeedGaming")!== -1 ? 0: 1];
                if(x.channelName && !x.channelName.match(sg.isPrimaryChannel))
                    expectedCrew = [0, 0, 0];
                return {
                    name: `**${moment(x.when).format('LT')}** | __${x.playerInfo.nameText}__`,
                    value: `ID: ${x.id} | ${x.channelText || "**TBD**"}
Commentators: ${x.crews[0].value.map(c=>c.discord).map(p=>findUser(p, msg, settings)).join(', ')} ${crewExtra(x,0,expectedCrew)}
Trackers: ${x.crews[1].value.map(c=>c.discord).map(p=>findUser(p, msg, settings)).join(', ')} ${crewExtra(x,1,expectedCrew)}
${showRestreamers(x,2,expectedCrew)} _${settings.showVariations ? x.variations: ''}_ ${setupText}`
                }
            });
        } else {
            var needsObject = [{name: "Commentary", text: "commentator", value: {}}, 
            {name: "Tracking", text: "tracker", value: {}}, {name: "Restreaming", text:"restreamer", value: {}}];

            selected.forEach((ep) => {
                let expectedCrew = [2, ep.playerInfo.value.length > 2? 2:1, ep.channelName.indexOf("SpeedGaming")!== -1 ? 0: 1];
                if(!ep.channelName.match(sg.isPrimaryChannel))
                    expectedCrew = [0, 0, 0];
                for(let i=0;i<3;i++){
                    let timeKey = moment(ep.when).format("h:mm A");
                    if(ep.crews[i].value.length < expectedCrew[i]){
                        needsObject[i].value[timeKey] = (needsObject[i].value[timeKey] || 0) + expectedCrew[i] - ep.crews[i].value.length;
                    }
                }

            });

            needsObject.forEach((section) => {
                if(section.text === "restreamer" && settings.showRestreamers !== "1")
                    return;
                    
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

        let url = "http://speedgaming.org/"+settings.event+"/crew/"
        if(settings.event.startsWith("sheets::")){
            let sId = settings.event.substr(8);
            let cur = sId.indexOf('::');
            if(cur !== -1){
                sId = sId.substr(0, cur);
            }

            url = `https://docs.google.com/spreadsheets/d/${sId}/edit`
        }

        msg.edit({embed: {
            color: 0xFFF0E0,
            url: url,
            title: `Schedule information for ${moment(baseTime).format('ll')}`,
            description: description,
            fields: fields,
            timestamp: new Date(),
            footer: {
                icon_url: (client.emojis.find(x=>x.name === "SwagDuck") || {url: client.user.avatarURL}).url,
                text: "Last updated: "
            }
        }});

        if(messageID && doReacts){
            message.react('✅');
        }
        return msg;
    }catch(err){
        client.logger.error("An error occured while loading schedule: " +err.stack);
        if(doReacts && message){
            await message.reply("An error occured while loading schedule: " +encodeURIComponent(err.stack));
        }

    }
    return null;
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
    description: "Shows the published event schedule for the specified date.",
    usage: "schedule <yesterday/TODAY/tomorrow/YYYY-MM-DD> <alttpr/sg/ALL/needs/full/notes>"
  };
  