// This will check if the node version you are running is the required
// Node version, if it isn't it will throw the following error to inform
// you.
if (Number(process.version.slice(1).split(".")[0]) < 10) throw new Error("Node 10.0.0 or higher is required. Update Node on your system.");

// Load up the discord.js library
const Discord = require("discord.js");
// We also load the rest of the things we need in this file:
const { promisify } = require("util");
const readdir = promisify(require("fs").readdir);
const Enmap = require("enmap");
const webHandler = require('./modules/WebHandler');
const cronHandler = require('./modules/ScheduledTasks');

// This is your client. Some people call it `bot`, some people call it `self`,
// some might call it `cootchie`. Either way, when you see `client.something`,
// or `bot.something`, this is what we're refering to. Your client.
const client = new Discord.Client();

client.config = require("../cfg/config.js");
client.logger = require("./modules/Logger");


require("./modules/functions.js")(client);

client.commands = new Enmap();
client.aliases = new Enmap();

client.settings = new Enmap({name: "settings"});


const init = async () => {

    // Here we load **commands** into memory, as a collection, so they're accessible
    // here and everywhere else.
    const cmdFiles = await readdir("./src/commands/");
    client.logger.log(`Loading a total of ${cmdFiles.length} commands.`);
    cmdFiles.forEach(f => {
      if (!f.endsWith(".js")) return;
      const response = client.loadCommand(f);
      if (response) console.log(response);
    });
  
    // Then we load events, which will include our message and ready event.
    const evtFiles = await readdir("./src/events/");
    client.logger.log(`Loading a total of ${evtFiles.length} events.`);
    evtFiles.forEach(file => {
      const eventName = file.split(".")[0];
      client.logger.log(`Loading Event: ${eventName}`);
      const event = require(`./events/${file}`);
      // Bind the client to any event, before the existing arguments
      // provided by the discord.js event. 
      // This line is awesome by the way. Just sayin'.
      client.on(eventName, event.bind(null, client));
    });
  
    // Generate a cache of client permissions for pretty perm names in commands.
    client.levelCache = {};
    for (let i = 0; i < client.config.permLevels.length; i++) {
      const thisLevel = client.config.permLevels[i];
      client.levelCache[thisLevel.name] = thisLevel.level;
    }
  
    // Here we login the client.
    await client.login(client.config.token);
  
    webHandler(client);
    cronHandler(client);

  // End top-level async/await function.
  };
  
  init();