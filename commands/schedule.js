const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');

exports.run = async (client, message, args, level) => {// eslint-disable-line no-unused-vars
    let sg = sgPre(client);
    const msg = await message.reply("Building schedule, please wait....");
    let baseTime = args[0] || "today";
    let target = args[1] || "alttpr";

    if(target != "alttpr" && target != "all" && target != "sg"){
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

    let list = await sg.list(moment(baseTime).startOf('day').format(), moment(baseTime).endOf('day').format(), 'alttpr');

    let selected = [];

    if(target === "sg") {
        selected = sg.filterSgMatches(list);
    }else if(target === "alttpr"){
        selected = sg.filterAlttprMatches(list);
    }else if(target === "all"){
        selected = sg.filteredDisplayedMatches(list);
    }
    let fields = selected.map(x=> { return {
        name: `**${moment(x.when).format('LT')}** | __${x.playerInfo.nameText}__`,
        value: `ID: ${x.id} | [${x.channelName}](https://twitch.tv/${x.channelName})
        Commentators: ${x.crews[0].value.map(c=>c.discord).join(', ')} (+${x.crews[0].count-x.crews[0].value.length})
        Trackers: ${x.crews[1].value.map(c=>c.discord).join(', ')} (+${x.crews[1].count-x.crews[1].value.length})
        Restreamers: ${x.crews[2].value.map(c=>c.discord).join(', ')} (+${x.crews[2].count-x.crews[2].value.length})
        _${x.variations}_`
    }});

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
        description: "Here's what we know about the schedule so far.",
        fields: fields
    }});
    
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: true,
    aliases: [],
    permLevel: "Moderators"
  };
  
  exports.help = {
    name: "schedule",
    category: "Miscellaneous",
    description: "Shows the published ALTTPR schedule for the specified date.",
    usage: "schedule <yesterday/today/tomorrow/YYYY-MM-DD> <alttpr/sg/all>"
  };
  