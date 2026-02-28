import { PostForm } from "./post-form.js";

type PostPageProps = {
    language: string;
    microblogEndpoint: string;
    microblogToken: string;
};

export const PostPage = ({ language, microblogEndpoint, microblogToken }: PostPageProps): string => {
    const postForm = PostForm({ microblogEndpoint, microblogToken });

    return "<!DOCTYPE html>\n" + (
        <html lang={language}>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <title>Post - chronixd</title>
                <link rel="stylesheet" href="assets/style.css" />
                <style dangerouslySetInnerHTML={{ __html: `
                    main { max-width: 480px; width: 100%; margin: 0 auto; padding: 1.5rem 1rem; }
                    main h1 { font-size: 1.1rem; margin: 0 0 1rem; }
                    #post-text { min-height: 120px; }
                ` }}></style>
            </head>
            <body>
                <main dangerouslySetInnerHTML={{ __html: `<h1>New Post</h1>${postForm}` }}>
                </main>
                <script src="assets/post-client.js" type="module"></script>
            </body>
        </html>
    );
};
