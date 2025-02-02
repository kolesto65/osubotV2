import { AttachmentType, MessageContext, VK } from "vk-io";
import { readFileSync } from "fs";
import cron from "node-cron";

import Message from "./Message";
import MapAPI from "./API/MapAPI";
import NewsController from "./News/NewsController";
import ChatCache from "./ChatCache";
import BotAPI from "./BotAPI";
import PrivilegesManager from "./Privileges";
import StandaloneCommand from "./Commands/StandaloneCommand";
import MapCommand from "./StandaloneCommands/Map";
import MapLinkProcessor from "./MapLinkProcessor";

import Admin from "./Modules/Admin";
import Main from "./Modules/Main";

import Module from "./Commands/Module";
import Bancho from "./Modules/Bancho";
import Gatari from "./Modules/Gatari"
import Kurikku from "./Modules/Kurikku";
import Ripple from "./Modules/Ripple";
import Enjuu from "./Modules/Enjuu";

import BanchoAPI from "./API/Osu/Servers/Bancho";
import GatariAPI from "./API/Osu/Servers/Gatari";
import KurikkuAPI from "./API/Osu/Servers/Kurikku";
import EnjuuAPI from "./API/Osu/Servers/Enjuu";
import RippleAPI from "./API/Osu/Servers/Ripple";
import AkatsukiAPI from "./API/Osu/Servers/Akatsuki";
import AkatsukiRelaxAPI from "./API/Osu/Servers/AkatsukiRelax";
import Akatsuki from "./Modules/Akatsuki";
import AkatsukiRelax from "./Modules/AkatsukiRelax";
import BanchoV2API from "./API/Osu/Servers/V2/BanchoV2";
import TrackAPI from "./API/TrackAPI";
import Logger, { LogLevel } from "./Logger";
import Banlist, { BanUtil } from "./Banlist";
import Config from "./Config";
import { Connection, createConnection, In } from "typeorm";
import { Notification } from "./Database/entity/Notification";
import { User } from "./Database/entity/User";
import { Ban } from "./Database/entity/Ban";
import DisableBotCommand from "./StandaloneCommands/DisableBot";
import Disabled from "./Disabled";
import IReplay from "./Replay/Replay";
import parseReplay from "./Replay/ReplayParser";
import Axios from "axios";
import { modsToString } from "./Util";
import PuppeteerInstance from "./PuppeteerInstance";

export interface IBotConfig {
    vk: {
        token: string,
        groupId: number,
        ownerId: number
    },
    osu: {
        token: string,
        username: string,
        password: string
    },
    api: {
        port: number,
        password: string
    }
}

interface IMapLink {
    beatmapsetId?: number;
    beatmapId?: number;
}

export default class Bot {
    vk = new VK({
        token: Config.data.vk.token,
        pollingGroupId: Config.data.vk.groupId
    });

    database: Connection;

    v2 = new BanchoV2API();

    track = new TrackAPI();
    
    modules: Module[] = [ 
        Main, 
        Admin, 
        Bancho,
        Gatari,
        Kurikku,
        Enjuu,
        Ripple,
        Akatsuki,
        AkatsukiRelax
    ].map(m => new m(this));

    commands: StandaloneCommand[] = [
        new MapCommand(),
        new DisableBotCommand()
    ];

    lastMaps = new ChatCache();

    maps = new MapAPI(2583);

    mapLinkProcessor = new MapLinkProcessor(this);
    private adminApi = new BotAPI(this);
    
    public news = new NewsController(this);

    private startTime: number;
    public get uptime(): number {
        return ~~((Date.now() - this.startTime) / 1000);
    }

    public privilegesManager = new PrivilegesManager();

    public disabled: Disabled = new Disabled();

    async start() {
        try {
            this.database = await createConnection();
            Logger.info("Database connection successful", "DB");
        } catch(e) {
            Logger.error(e);
            Logger.fatal("Database connection failed", "DB");
        }

        try {
            await this.vk.updates.start();

            this.startTime = Date.now();
            Logger.info("VK Long Poll listening", "BOT");
        } catch(e) {
            Logger.error(e);
            Logger.fatal("VK Long Poll connection failed", "BOT");
        }

        try {
            await this.v2.login(
                Config.data.osu.username,
                Config.data.osu.password
            );

            Logger.info("Successfully logged in!", "V2");
        } catch(e) {
            Logger.error(e);
            Logger.error("Login failed!", "V2");
        }

        try {
            await PuppeteerInstance.initialize()
            Logger.info("Puppeteer successfully initialized!");
        } catch(e) {
            Logger.error(e);
            Logger.fatal("Puppeteer failed to initialize!");
        }
        
        this.v2.data.start();
        if(this.v2.logged)
            Logger.info(`Updating V2 data every ${Math.floor(this.v2.data.interval / 1e3)} seconds`, "V2");
        
        cron.schedule('*/5 * * * *', () => { this.updateUses() });

        Logger.debug(`Initialized with ${this.modules.length} modules and ${this.modules.flatMap(m => m.commands).length + this.commands.length} commands`, "BOT");

        this.startMessageListening();
    }
    
    private startMessageListening() {
        this.vk.updates.on("new_message", async ctx => {
            try {
                let user = await User.findOrCreate(ctx.senderId);
                let message = new Message(ctx, user);
                
                let notifications = await Notification.find({
                    where: { user: { id: user.id }, delivered: false },
                    order: { id: "ASC" }
                });
                await Notification.update({
                    id: In(notifications.map(n => n.id))
                }, {
                    delivered: true
                });
                for(let notification of notifications)
                    await message.reply(notification.message);

                let mapLink = this.mapLinkProcessor.checkLink(message, ctx);

                if (mapLink && !this.disabled.isDisabled(message.peerId)) 
                    return this.mapLinkProcessor.process(message, mapLink);

                let replay = ctx.getAttachments("doc").filter(d => d.extension == "osr")[0]

                if(replay && !this.disabled.isDisabled(message.peerId))
                    return this.sendReplayData(ctx, replay.url)

                for(let module of this.modules)
                    await module.run(message, this);
                
                message.arguments.unshift(message.command);
                for(let command of this.commands) {
                    if(this.disabled.isDisabled(message.peerId) && command.disables) continue;

                    if(command.command.includes(message.prefix)) {
                        let ban = await Ban.findOne({ where: { user: { id: message.sender } } });
                        if(ban?.isBanned && !command.ignoreBan) continue;
                        try {
                            let args = command.parseArguments(message, this);
                            command.use(message);
                            await command.run(args);
                        } catch(e) {
                            message.reply(`Ошибка! ${e instanceof Error ? e.message : e}`);
                        }
                    }
                }
            } catch(e) {
                console.log(e)
            }
        });
    }

    private async sendReplayData(ctx: MessageContext, link: string) {
        try {
            let { data } = await Axios.get(link, { responseType: "arraybuffer" })
            let replay = parseReplay(data)
            let id = await this.maps.getBeatmapIdFromHash(replay.beatmapHash)
            let map = await this.maps.getBeatmap(id, modsToString(replay.mods))
        } catch(e) {

        }
    }

    private updateUses() {
        for(let module of this.modules) {
            for(let command of module.commands) {
                command.uses.push(0);
                if(command.uses.length > 12)
                    command.uses.shift();
            }
        }
    }
}