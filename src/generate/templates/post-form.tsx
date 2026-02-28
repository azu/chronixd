type PostFormProps = {
    microblogEndpoint: string;
};

export const PostForm = ({ microblogEndpoint }: PostFormProps): string => {
    return (
        <section class="post-form" data-endpoint={microblogEndpoint}>
            <h2>New Post</h2>
            <form id="post-form">
                <textarea id="post-text" placeholder="What's on your mind?" rows="3" required={true}></textarea>
                <div class="post-form-actions">
                    <label class="post-form-upload">
                        <input type="file" id="post-images" accept="image/*" multiple={true} />
                        <span>Add images</span>
                    </label>
                    <button type="submit" class="post-form-submit">Post</button>
                </div>
                <div id="post-image-preview" class="post-image-preview"></div>
                <div id="post-status" class="post-status"></div>
            </form>
        </section>
    );
};
