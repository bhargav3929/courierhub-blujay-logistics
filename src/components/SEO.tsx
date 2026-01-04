import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title: string;
    description?: string;
}

export default function SEO({ title, description }: SEOProps) {
    const metaDescription = description || "Blujay Logistics - Your Complete Shipping Aggregation Platform";
    const fullTitle = `${title} | Blujay Logistics`;

    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="description" content={metaDescription} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={metaDescription} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={metaDescription} />
        </Helmet>
    );
}
