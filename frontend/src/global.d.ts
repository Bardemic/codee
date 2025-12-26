declare module '*.svg' {
    const content: string;
    export default content;
}

declare module '*.module.css' {
    const styles: { [key: string]: string };
    export default styles;
}
