import Command from "./Command";
import Message from "../Message";
import Bot from "../Bot";
import { BanUtil } from "../Banlist";
import dateformat from "dateformat";
import PermissionManager, { Permission } from "../Permissions";

export default abstract class Module {
    abstract name: string;
    abstract prefix: string[];

    abstract description: string;

    abstract commands: Command[];
    
    constructor(
        private bot: Bot,
    ) {}

    permission: Permission = null;

    protected get database() { return this.bot.database; }
    protected get apilist() { return this.bot.api; }

    async run(message: Message, bot: Bot) {
        if(!this.prefix.includes(message.prefix)) return;

        if(message.command == "help" || message.command == "рудз") 
            return this.help(message);

        let command = this.commands.find(c => c.command.includes(message.command));
        if(!command) return;

        if(this.permission || command.permission)
            if(!PermissionManager.hasPermission(message.user.role.permissions, command.permission ?? this.permission)) return;

        let ban = await this.database.ban.findFirst({
            where: { userId: message.sender }
        });
        if(BanUtil.isBanned(ban)) {
            if(!command.ignoreBan 
                && PermissionManager.hasPermission(message.user.role.permissions, Permission.IGNOREBAN)) return;
        }
        
        try {
            command.use(message);
            
            let args = command.parseArguments(message, bot);
            await command.run(args);
        } catch(e) {
            message.reply(`Ошибка! ${e instanceof Error ? e.message : e}`);
        }
    }

    help(message: Message) {
        message.reply(`
            Категория: ${this.name} - ${this.description}
            Префиксы: ${this.prefix.join(', ')}

            ${this.commands.map(c => `${c.name} - (${c.command.join(', ')}) - ${c.description}`).join('\n')}
        `);
    }
}