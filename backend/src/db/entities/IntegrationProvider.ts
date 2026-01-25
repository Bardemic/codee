import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique, OneToMany } from 'typeorm';
import type { Tool } from './Tool';
import type { IntegrationConnection } from './IntegrationConnection';

@Entity()
@Unique(['slug'])
export class IntegrationProvider {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar", nullable: true })
    slug!: string;

    @Column({ type: "varchar", nullable: true })
    displayName!: string;

    @Column({ type: 'varchar',  default: false })
    hasCloudAgent!: boolean;

    @Column({ type: 'jsonb', default: {} })
    schema!: Record<string, unknown>;

    @CreateDateColumn()
    createdAt!: Date;

    @OneToMany('Tool', 'provider')
    tools!: Tool[];

    @OneToMany('IntegrationConnection', 'provider')
    connections!: IntegrationConnection[];
}
