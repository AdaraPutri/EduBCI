export const paragraphs = [
  // neutral paragraphs
  {
    paragraphId: 1,
    type: "neutral",
    text: `A computer program is simply a list of instructions that tells the computer what to do step by step. It is like a recipe in a cookbook, where each line describes the next action very clearly. The computer follows these steps exactly, without guessing or using feelings. If the instructions are clear and complete, the computer always produces the same result every time you run the program.`
  },
  // partly confusing paragraphs
  {
    paragraphId: 2,
    type: "partly_confusing",
    text: `Many mobile apps let you create an account so your data is saved even if you delete the app or switch phones later on. The server stores your username, email, and settings in a simple record that can be loaded whenever you log in again. When you tap the “save” button, the app sends this record to a remote computer called a server, which writes it into a database table and replies with a confirmation that the changes were successful. In a larger system, though, that record may first pass through an orchestration layer that rewrites it into a normalized event format before it ever touches the main storage engine, which can cause subtle timing differences between what you see and what is actually committed. If the event bus becomes congested, two versions of the same profile can temporarily coexist inside different processing pipelines, and the configuration shown on your screen might reflect an intermediate snapshot that no longer matches the final, reconciled state.`
  },
  // fully confusing paragraphs
  {
    paragraphId: 3,
    type: "fully_confusing",
    text: `Recent work in homotopy type theory treats programs as paths in higher-dimensional spaces, so proving two functions equivalent can require constructing continuous deformations between their proofs rather than comparing outputs, which makes even simple refactorings depend on fragile higher-inductive encodings. Doctoral projects that extend these systems often combine univalence axioms, cubical models, and synthetic homotopy, leaving apparently minor changes in a library’s definition order capable of breaking downstream proofs in ways that feel more topological than computational to anyone trained only in conventional semantics. Because of this, automated proof repair rarely behaves intuitively; a small edit near a base point may force expensive global recomputation of path equalities, so the practical cost of renaming a constructor can scale with geometric complexity rather than code size. In practice, many prototype proof assistants expose partially implemented features, undocumented tactics, and version-specific bugs, so reproducing a published result often requires reverse-engineering the author’s development environment instead of following the written proof script step by step.`
  },
];

export default paragraphs;

