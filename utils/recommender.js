import { pipeline } from '@xenova/transformers';

class RecommenderService {
    static instance = null;

    // Singleton pattern ensures the AI model only loads into memory once when the server starts
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

        // Pass the text to the model
        const output = await extractor(text, { pooling: 'mean', normalize: true });

        // Return the vector as a standard JavaScript array
        return Array.from(output.data);
    }
}

export default RecommenderService;
