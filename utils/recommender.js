import { pipeline } from '@xenova/transformers';

class RecommenderService {
    static instance = null;

   
    static async getInstance() {
        if (!this.instance) {
            console.log("Loading AI Vector Model... (This takes a few seconds on first run)");
            this.instance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log("AI Model Loaded successfully!");
        }
        return this.instance;
    }

    static async generateEmbedding(text) {
        const extractor = await this.getInstance();

       
        const output = await extractor(text, { pooling: 'mean', normalize: true });

       
        return Array.from(output.data);
    }
}

export default RecommenderService;
