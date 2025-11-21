import styles from './createBranch.module.css';
import { GrGithub } from 'react-icons/gr';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

type CreateBranchProps = {
    createBranch: () => void;
    branch_name: string | null;
    github_repository_name: string;
    isLoading: boolean;
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
        <button onClick={props.createBranch} className={styles.button} disabled={props.isLoading}>
            {props.isLoading ? <AiOutlineLoading3Quarters size={24} className={styles.spinIcon} /> : <GrGithub size={24}/>}
            Create Branch
        </button>
    )
}