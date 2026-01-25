import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, OneToMany } from 'typeorm';
import type { Agent } from './Agent';
import type { ToolCall } from './ToolCall';

export type SenderType = 'USER' | 'AGENT';

export type MessageImage = {
    data: string;
    mimeType: string;
};

@Entity()
export class Message {
    @PrimaryGeneratedColumn()
    id!: number;

    @CreateDateColumn()
    createdAt!: Date;

    @ManyToOne('Agent', 'messages', { onDelete: 'CASCADE' })
    agent!: Agent;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'varchar', length: 5 })
    sender!: SenderType;

    @Column({ type: 'json', default: '[]' })
    images!: MessageImage[];

    @Column({ type: 'int', default: 0 })
    promptTokens!: number;

    @Column({ type: 'int', default: 0 })
    completionTokens!: number;

    @Column({ type: 'int', default: 0 })
    totalTokens!: number;

    @Column({ type: 'text', nullable: true })
    error?: string;

    @Column({ type: 'text', default: 'gpt-5-mini' })
    model!: string;

    @Column({ type: 'int', default: 0 })
    costMicrodollars!: number;


    @Column({ type: 'int', default: 0 })
    sandboxDurationMs!: number;

    @OneToMany('ToolCall', 'message')
    toolCalls!: ToolCall[];
}
