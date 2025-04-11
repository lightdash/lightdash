import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
    return (
        <>
            <Image
                className={styles.logo}
                src="/next.svg"
                alt="Next.js logo"
                width={180}
                height={38}
                priority
            />

            <div className={styles.ctas}>
                <a className={styles.primary} href="/dashboard">
                    <Image
                        className={styles.logo}
                        src="/vercel.svg"
                        alt="Vercel logomark"
                        width={20}
                        height={20}
                    />
                    Check out Lightdash Dashboard
                </a>
            </div>
        </>
    );
}
