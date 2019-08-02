const {google} = require('googleapis');
const {promisify} = require('es6-promisify');
const moment = require('moment');

module.exports = (client) => {
    
    function parsePlayer(entry){
        let runner = {
            approved: entry.approved || false,
            name: entry.displayName,
            stream: entry.publicStream,
            language: entry.language || "en",
            discord: entry.discordTag
        }

        if(runner.stream === '' || !runner.stream)
            runner.stream = entry.displayName;

        if(runner.name === '' || !runner.name)
            runner.name = runner.stream;

        if(runner.discord === '' || !runner.discord)
            runner.discord = runner.name;

        return runner;
    }

    function processEpisode(episode){

        let res = Object.assign({
            channelName: '',
            channelText: '',
            primaryChannel: {}}, episode);

        res.commentatorCount = episode.commentators.length;
        res.allCommentators = episode.commentators.map(parsePlayer);
        res.commentators = episode.commentators.filter(x=>x.approved).map(parsePlayer);

        res.trackerCount = episode.trackers.length;
        res.allTrackers = episode.trackers.map(parsePlayer);
        res.trackers = episode.trackers.filter(x=>x.approved).map(parsePlayer);

        res.broadcasterCount = episode.broadcasters.length;
        res.allBroadcasters = episode.broadcasters.map(parsePlayer);
        res.broadcasters = episode.broadcasters.filter(x=>x.approved).map(parsePlayer);

        let allPlayers = [];
        let playerNames = "";

        if(episode.match1 && episode.match1.players){
            res.match1.players = episode.match1.players.map(parsePlayer);
            playerNames = res.match1.players.map(x=> x.name).join(" vs ");
            allPlayers.push(...res.match1.players);
        }
        if(episode.match2 && episode.match2.players){
            res.match2.players = episode.match2.players.map(parsePlayers);
            playerNames += ", " +res.match2.players.map(x=> x.name).join(" vs ");
            allPlayers.push(...res.match2.players);
        }


        res.crews = [
            {name:"Commentators",
            variable: "commentators",
            variable2: "commentatorNames",
            value: res.commentators, 
            allValues: res.allCommentators,
            count: res.commentatorCount,
            hasEnough: res.commentators.length >= 2,
            streamText: res.commentators.filter(x => x.language == "en").map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.commentators.filter(x => x.language == "en").map(x=> x.name).join(" & ")
            },
            {name:"Trackers", 
            variable: "trackers",
            variable2: "trackerNames",
            value: res.trackers, 
            allValues: res.allTrackers,
            count: res.trackerCount,
            hasEnough: allPlayers.length > 2 ? res.trackers.length >= 2: res.trackers.length >= 1,
            streamText: res.trackers.filter(x => x.language == "en").map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.trackers.filter(x => x.language == "en").map(x=> x.name).join(" & ")},
            {name:"Restreamers", 
            variable: "restreamers",
            variable2: "restreamerNames",
            value: res.broadcasters,
            allValues: res.allBroadcasters,
            count: res.broadcasterCount,
            streamText: res.broadcasters.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: res.broadcasters.map(x=> x.name).join(" & ")}
        ];

        res.variations = episode.match1 && episode.match1.title? episode.match1.title : "";
        
        let ignore = ['Undecided, Not SG', 'No Restream'];

        if(res.channels){
            res.channels = res.channels.filter(x=>!ignore.some(i => i.toLowerCase() === x.name.toLowerCase()));
        }

        if(res.channels && res.channels.length > 0){
            let primaryChannel = res.channels.find(x=>x.name.match(/^(speedgaming\d*|alttprandomizer\d*)$/gi));
            res.channelName = primaryChannel ? primaryChannel.name : res.channels[0].name;
            res.primaryChannel = primaryChannel;
            res.showAssigned = primaryChannel && true;
            res.needsBroadcasters = !primaryChannel || primaryChannel.name.match(/^alttprandomizer\d*$/gi);
            let chan = res.channels.map(x=> `[${x.name}](https://twitch.tv/${x.name})`);
            chan.sort();
            res.channelText = chan.join(', ');
        }else{
            res.needsBroadcasters = true;
            res.showAssigned = false;
        }

        if(res.needsBroadcasters){
            res.crews[2].hasEnough = res.crews[2].value.length >= 1;
        }else{
            res.crews[2].hasEnough = true;
        }

        res.fullyStaffed = res.crews.every(x=>x.hasEnough);

        res.playerInfo = {
            "name": "Players",
            variable: "players",
            variable2: "playerNames",
            value: allPlayers,
            streamText: allPlayers.map(x=> "twitch.tv/" + x.stream).join(" & "),
            nameText: playerNames
        }

        return res;

    }

    function decodeSheet(row){
        let map = {players: [], commentators:[], trackers:[], broadcasters:[]};
        for(let i = 0; i < row.length; i++) {
            let field = row[i];
            if(/modes/i.test(field)) {
                map.modes = i;
            }
            else if(/time/i.test(field)) {
                map.time = i;
            }
            else if(/date/i.test(field)) {
                map.date = i;
            }
            else if(/channel/i.test(field)){
                map.channel = i;
            }
            else if(/commentator/i.test(field)){
                map.commentators.push({name: i, stream: i, discord: i, approved: true});
            }
            else if(/tracker/i.test(field)){
                map.trackers.push({name: i, stream: i, discord: i, approved: true});
            }
            else if(/restreamer/i.test(field)){
                map.broadcasters.push({name: i, stream: i, discord: i, approved: true});
            }
            else if(/runner|player/i.test(field)){
                let reg = field.match(/(?:runner|player)\s+(?<id>\d+)\s*(?<param>\w+)?/i);
                //Assume non-ordered single runner block??
                if(!reg){
                    map.players.push({name: i, stream: i, discord: i});
                }else{
                    let id = parseInt(reg.groups.id);

                    for(let runs = map.players.length; runs < id; runs++){
                        map.players.push({});
                    }

                    id = id - 1;

                    if(reg.groups.param){
                        if(/twitch/i.test(reg.groups.param)){
                            map.players[id].stream = i;
                        }
                        else if(/discord/i.test(reg.groups.param)){
                            map.players[id].discord = i;
                        }
                        else if(/(display|name)/i.test(reg.groups.param)){
                            map.players[id].name = i;
                        }
                        else if(!map.players[id].stream){
                            map.players[id].stream = i
                        }

                    }else{
                        map.players[id] = {name: i, stream: i, discord: i}
                    }
                }


            }

        }
        return map;
    }
    async function getEpisodes(event){
        const sheets = google.sheets({version: 'v4', auth: client.config.googledocs.key});

        let spreadsheetId = event && event.startsWith('sheets::') ? event.substr(8) : event;
        let sheet = "Form Responses 1";
        let name =  "ALTTPR Tournament";
        let loc = spreadsheetId.indexOf('::');
        if(loc !== -1){
            sheet = spreadsheetId.substr(loc+2);
            spreadsheetId = spreadsheetId.substr(0, loc);
        }
        loc = sheet.indexOf('::');
        if(loc !== -1){
            name = sheet.substr(loc+2);
            sheet = sheet.substr(0, loc);
        }

        const response = await sheets.spreadsheets.values.get({spreadsheetId: spreadsheetId, range: [sheet] });
        const rows = response.data.values;

        if(rows.length < 2){
            client.logger.debug("[SHEETS]:: No episodes found?");
            return [];
        }

        const columnMapping = decodeSheet(rows[0]);
        let episodes = [];

        for(let i=1;i<rows.length;i++){
            let row = rows[i];

            let episode = {
                approved: true, 
                event: {
                    name, 
                    active: true, 
                    game: name, 
                    shortName: name, 
                    id: 99999, 
                    slug: "slug"
                }, 
                match1: null,
                match2: null,
                channels: [],
                broadcasters: [],
                commentators: [],
                trackers: [],
                title: name,
                when: null,
                id: i+1,
                length: 180,
            };

            if("modes" in columnMapping){
                episode.variations = row[columnMapping.modes];
            }

            if("channel" in columnMapping){
                let channel = row[columnMapping.channel];

                if(/\d+/.test(channel)){
                    channel = "alttprandomizer" + channel;

                }else if(!channel){
                    channel = "";
                }
                if(/alttprandomizer1/i.test(channel)){
                    channel = "alttprandomizer";
                }
                episode.channels.push({language: "en", id:99999, name: channel, slug: channel});
            }

            if("date" in columnMapping){
                let m = moment(row[columnMapping.date]);

                if("time" in columnMapping){
                    let t = moment(row[columnMapping.time], 'h:mm:ss A');
                    m = m.set({
                        'hour': t.get('hour'),
                        'minute': t.get('minute'),
                        'second': t.get('second')
                    });
                }

                episode.when = m.toISOString();
            }



            if(columnMapping.players.length > 0){
                episode.match1 = {note: "", title:"", players: [], id: 49998}
                for(let p = 0; p < columnMapping.players.length && p < 2; p++){
                    let publicStream = row[columnMapping.players[p].stream];
                    if(!publicStream)
                        continue;
                    let displayName = ("name" in columnMapping.players[p]) ? row[columnMapping.players[p].name] : publicStream;
                    let discordTag = ("discord" in columnMapping.players[p]) ? row[columnMapping.players[p].discord] : publicStream;
                    
                    episode.match1.players.push({ displayName, publicStream, discordTag });
                }
            }
            if(columnMapping.players.length > 2){
                episode.match2 = {note: "", title:"", players: [], id: 49999}
                for(let p = 2; p < columnMapping.players.length && p < 4; p++){
                    let publicStream = row[columnMapping.players[p].stream];
                    if(!publicStream)
                        continue;
                    let displayName = ("name" in columnMapping.players[p]) ? row[columnMapping.players[p].name] : publicStream;
                    let discordTag = ("discord" in columnMapping.players[p]) ? row[columnMapping.players[p].discord] : publicStream;
                    
                    episode.match2.players.push({ displayName, publicStream, discordTag });
                }
            }

            for(let p = 0; p < columnMapping.commentators.length; p++){
                let publicStream = row[columnMapping.commentators[p].stream];
                if(!publicStream)
                    continue;
                let displayName = ("name" in columnMapping.commentators[p]) ? row[columnMapping.commentators[p].name] : publicStream;
                let discordTag = ("discord" in columnMapping.commentators[p]) ? row[columnMapping.commentators[p].discord] : publicStream;
                
                episode.commentators.push({ approved: true, displayName, publicStream, discordTag });
            }
            for(let p = 0; p < columnMapping.trackers.length; p++){
                let publicStream = row[columnMapping.trackers[p].stream];
                if(!publicStream)
                    continue;
                let displayName = ("name" in columnMapping.trackers[p]) ? row[columnMapping.trackers[p].name] : publicStream;
                let discordTag = ("discord" in columnMapping.trackers[p]) ? row[columnMapping.trackers[p].discord] : publicStream;
                
                episode.trackers.push({ approved: true, displayName, publicStream, discordTag });
            }

            for(let p = 0; p < columnMapping.broadcasters.length; p++){
                let publicStream = row[columnMapping.broadcasters[p].stream];
                if(!publicStream)
                    continue;
                let displayName = ("name" in columnMapping.broadcasters[p]) ? row[columnMapping.broadcasters[p].name] : publicStream;
                let discordTag = ("discord" in columnMapping.broadcasters[p]) ? row[columnMapping.broadcasters[p].discord] : publicStream;
                
                episode.broadcasters.push({ approved: true, displayName, publicStream, discordTag });
            }
            
            episodes.push(episode);
        }

        return episodes;
    }

    return {
        list: async (from, to, event, filter=true) => {
            
            let episodes = await getEpisodes(event);
    
            if(!episodes || episodes.length === 0){
                client.logger.debug("No episodes?");
                return [];
            }
    
            let filtered = filter? episodes.filter(m=>m.approved) : episodes;

            let f = moment(from);
            let t = moment(to);
            filtered = episodes.filter(p=>moment(p.when).isBetween(f, t))
    
            for(var i=0;i<filtered.length;i++){
                filtered[i] = processEpisode(filtered[i]);
            }

            return filtered;
        },
        get: async(id) => {
            let episodes = await getEpisodes(client.settings.event);

            if(!episodes || episodes.length === 0){
                client.logger.debug("No episodes?");
                return null;
            }

            let episode = episodes.find(e => e.id == id);

            if(!episode){
                client.logger.debug("Error while retrieving episode.");
                return null;
            }
    
            return processEpisode(episode);
    
        }
    
    }

}