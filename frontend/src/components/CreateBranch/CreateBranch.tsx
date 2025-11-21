import styles from './createBranch.module.css';
import { GrGithub } from 'react-icons/gr';

type CreateBranchProps = {
    createBranch: () => void;
    branch_name: string | null;
    github_repository_name: string;
};

export default function CreateBranch(props: CreateBranchProps) {
    const openBranch = () => {
        if (props.branch_name && props.github_repository_name) {
            const githubUrl = `https://github.com/${props.github_repository_name}/tree/${props.branch_name}`;
            window.open(githubUrl, '_blank');
        }
    }

    if (props.branch_name) return (
        <button onClick={openBranch} className={styles.button}>
            <GrGithub size={24}/>
            Open Branch
        </button>
    )

    return (
        <button onClick={props.createBranch} className={styles.button}>
            <GrGithub size={24}/>
            Create Branch
        </button>
    )
}