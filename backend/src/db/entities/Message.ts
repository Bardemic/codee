import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, OneToMany } from 'typeorm';
import type { Agent } from './Agent';
import type { ToolCall } from './ToolCall';

export type SenderType = 'USER' | 'AGENT';

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

    @OneToMany('ToolCall', 'message')
    toolCalls!: ToolCall[];
}
