interface ButtonProps {
    text: string
}

export default function SidebarButton(props: ButtonProps) {
    return (
        <div>
            {props.text}
        </div>
    )
}