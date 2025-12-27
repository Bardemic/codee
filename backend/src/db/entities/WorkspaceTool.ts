import { Entity, PrimaryGeneratedColumn, ManyToOne, CreateDateColumn } from 'typeorm';
import { Workspace } from './Workspace';
import { Tool } from './Tool';

@Entity()
export class WorkspaceTool {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
    workspace!: Workspace;

    @ManyToOne(() => Tool, { onDelete: 'CASCADE' })
    tool!: Tool;

    @CreateDateColumn()
    createdAt!: Date;
}
