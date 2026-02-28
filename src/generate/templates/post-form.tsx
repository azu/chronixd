type PostFormProps = {
    microblogEndpoint: string;
    microblogToken: string;
};

const imageIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

export const PostForm = ({ microblogEndpoint, microblogToken }: PostFormProps): string => {
    return (
        <section class="post-form" data-endpoint={microblogEndpoint} data-token={microblogToken}>
            <form id="post-form">
                <textarea id="post-text" placeholder="What's on your mind..." rows="4"></textarea>
                <div class="post-form-actions">
                    <label class="post-form-upload">
                        <input type="file" id="post-images" accept="image/*" multiple={true} />
                        <span dangerouslySetInnerHTML={{ __html: `${imageIcon} image` }}></span>
                    </label>
                    <button type="submit" class="post-form-submit">Post</button>
                </div>
                <div id="post-image-preview" class="post-image-preview"></div>
                <div id="post-status" class="post-status"></div>
            </form>
        </section>
    );
};
