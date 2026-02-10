import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from 'typeorm';
import type { Organization } from './Organization';

export interface EnvironmentFile {
    path: string;
    content: string;
}

@Entity()
@Index(['name', 'organizationId'], { unique: true })
export class Environment {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 200 })
    name!: string;

    @Column()
    organizationId!: number;

    @ManyToOne('Organization', {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @Column({ length: 500 })
    githubRepositoryName!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'jsonb', default: [] })
    files!: EnvironmentFile[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
