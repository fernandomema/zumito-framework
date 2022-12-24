import { GuildMember, TextChannel } from "discord.js";
import { Command } from "./types/Command.js";
import { FrameworkSettings } from "./types/FrameworkSettings.js";
import { Module } from "./types/Module.js";
import { FrameworkEvent } from "./types/FrameworkEvent.js";
import { TranslationManager } from "./TranslationManager.js";
import { Request, Response } from 'express';
/**
 * @class ZumitoFramework
 * @classdesc The main class of the framework.
 *
 * @property {FrameworkSettings} settings - The settings of the framework.
 * @property {Client} client - The client client instance.
 * @property {Collection<string, Module>} modules - The modules loaded in the framework.
 * @property {Collection<string, Command>} commands - The commands loaded in the framework.
 */
export declare class ZumitoFramework {
    client: any;
    settings: FrameworkSettings;
    modules: Map<string, Module>;
    commands: Map<string, Command>;
    events: Map<string, FrameworkEvent>;
    translations: TranslationManager;
    models: any;
    routes: Map<string, (req: Request, res: Response) => void>;
    database: any;
    app: any;
    /**
     * @constructor
     * @description Creates a new instance of the framework.
     * @param {FrameworkSettings} settings - The settings of the framework.
     * @example new ZumitoFramework({
     *     prefix: '!',
     *     discordClientOptions: {
     *        token: 'token',
     *        clientId: 'clientId',
     *       intents: 0
     *    }
     * });
     * @public
     */
    constructor(settings: FrameworkSettings, callback?: Function);
    initialize(): Promise<void>;
    startApiServer(): void;
    private registerModules;
    private registerModule;
    private initializeDiscordClient;
    static splitCommandLine(commandLine: any): any;
    memberHasPermission(member: GuildMember, channel: TextChannel, permission: bigint): Promise<boolean>;
    getGuildSettings(guildId: string): Promise<any>;
    refreshSlashCommands(): Promise<void>;
}
