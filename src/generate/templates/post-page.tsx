import { PostForm } from "./post-form.js";

type PostPageProps = {
    language: string;
    microblogEndpoint: string;
    microblogToken: string;
};

export const PostPage = ({ language, microblogEndpoint, microblogToken }: PostPageProps): string => {
    const postForm = PostForm({ microblogEndpoint, microblogToken, autofocus: true });

    return "<!DOCTYPE html>\n" + (
        <html lang={language}>
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <title>Post - chronixd</title>
                <link rel="stylesheet" href="assets/style.css" />
                <style dangerouslySetInnerHTML={{ __html: `
                    .post-page-header { display: flex; align-items: center; justify-content: space-between; margin: 0 0 1rem; }
                    .post-page-header h1 { font-size: 1.1rem; margin: 0; padding: 0; border: none; }
                    .post-page-close { font-family: var(--font-mono); font-size: 0.8rem; color: var(--c-text-muted); text-decoration: none; padding: 0.25rem 0.5rem; border: 1px solid var(--c-border); border-radius: var(--radius); }
                    .post-page-close:hover { color: var(--c-text); border-color: var(--c-text-muted); }
                    #post-text { min-height: 120px; }
                    @media (min-width: 601px) { #post-text:focus { min-height: 200px; } }
                ` }}></style>
            </head>
            <body>
                <main dangerouslySetInnerHTML={{ __html: `<div class="post-page-header"><h1>New Post</h1><a href="javascript:void(0)" onclick="goBack()" class="post-page-close">Close</a></div>${postForm}` }}>
                </main>
                <script src="assets/post-client.js" type="module"></script>
                <script dangerouslySetInnerHTML={{ __html: `function goBack(){if(history.length>1){history.back()}else{location.href="today.html"}}document.addEventListener("keydown",function(e){if(e.key==="Escape")goBack()})` }}></script>
            </body>
        </html>
    );
};
