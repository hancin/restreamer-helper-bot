const moment = require('moment');
const sgPre = require('../modules/SpeedGaming');
exports.run = async (client, message, [action, episode, ...note], level) => {// eslint-disable-line no-unused-vars
    const sg = sgPre(client);
    var fullNote = (note || []).join(" ");

    if(!action){
        await message.react('❌');
        await message.reply('`action` is required.');
        return;
    }

    var validActions = ['add', 'remove', 'show'];

    if(!validActions.includes(action)){
        await message.react('❌');
        await message.reply('`action` must be one of '+validActions.join(', ')+'.');
        return;
    }


    if(!episode){
        await message.react('❌');
        await message.reply('`episode` is required');
    }

    
    if(action === "add" && !fullNote){
        await message.react('❌');
        await message.reply('`message` is required');
    }

    let realEp = parseInt(episode);

    const ep = await sg.get(realEp);

    if(!ep){
        await message.react('❌');
        await message.reply('Could not obtain episode '+realEp+".");
    }

    if(action === "show"){
        let notes = await client.db.matchNotesGetEpisode(realEp);
        notes = notes.filter(x=>x.permLevel <= level);

        if(notes.length === 0){
            await message.reply(`No notes found for **[${moment(ep.when).calendar()}] ${ep.playerInfo.nameText}**.`);
            return;
        }

        await message.channel.send(`=== [${moment(ep.when).calendar()}] ${ep.playerInfo.nameText} ===` + "\n" + notes.map(x=> `${x.id} :: `+ x.note).join("\n"), {code: 'asciidoc'});
        return;
    }

    if(action === "add"){
        let id = await client.db.matchNotesPutEpisode(realEp, Object.assign({}, client.db.matchNotesNew(), {
            memberId: message.author.id,
            episodeId: realEp,
            permLevel: 3,
            note: fullNote
        }));

        await message.react('✅');
        await message.reply(`Note ${id.lastID} added to **[${moment(ep.when).calendar()}] ${ep.playerInfo.nameText}**`);
    }

  };
  
  exports.conf = {
    enabled: true,
    guildOnly: false,
    aliases: [],
    permLevel: "Moderator"
  };
  
  exports.help = {
    name: "notes",
    category: "Moderation",
    description: "Add informative notes to an episode for later reference. These notes are available to everyone [Moderator] and above",
    usage: "notes <add/show> <episode> <message>"
  };
  