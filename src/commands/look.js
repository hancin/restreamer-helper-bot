exports.run = async (client, message, args, level) => {// eslint-disable-line no-unused-vars
    await message.reply("👀");
    await message.react("👀");
  };
  
  exports.conf = {
    enabled: true,
    guildOnly: false,
    aliases: [],
    permLevel: "Moderators"
  };
  
  exports.help = {
    name: "look",
    category: "System",
    description: "Test the operation of the bot with this simple command!",
    usage: "look"
  };
  