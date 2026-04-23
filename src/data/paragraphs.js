export const paragraphs = [
  // neutral paragraphs
  {
    paragraphId: 1,
    type: "neutral",
    text: `A computer program is simply a list of instructions that tells the computer what to do step by step. It is like a recipe in a cookbook, where each line describes the next action very clearly. The computer follows these steps exactly, without guessing or using feelings. If the instructions are clear and complete, the computer always produces the same result every time you run the program.`
  },
  {
    paragraphId: 2,
    type: "neutral",
    text: `When you click an icon on your desktop to open a program, the computer loads that program from the storage into memory. The program then waits for your actions, such as typing on the keyboard or moving the mouse. Each click or key press is treated as an input that the program can react to. In this way, computers feel interactive even though they only follow simple instructions very quickly.`
  },
  {
    paragraphId: 3,
    type: "neutral",
    text: `A variable in programming is like a labeled box where you can store a piece of information. The label might be called age, score, or temperature, and inside the box is a value such as a number or a word. You can open the box, change what is inside, and close it again as many times as needed. Programs use many of these boxes to remember important information while they run.`
  },
  {
    paragraphId: 4,
    type: "neutral",
    text: `Basic programs often read some input, do a small calculation, and then show an output on the screen. For example, a program might ask for your name, store it in a variable, and then print a greeting that includes your name. Another simple program might ask for two numbers, add them, and display the total. These small examples help beginners see how data moves from the keyboard into the program and back to the screen.`
  },
  {
    paragraphId: 5,
    type: "neutral",
    text: `An if statement lets the computer choose between two paths depending on a simple question. The question could be “Is this number bigger than ten?” or “Did the user type the correct password?”. If the answer is yes, one block of instructions runs; if the answer is no, a different block runs instead. This basic idea allows programs to behave differently in different situations, much like how a person decides what to do based on circumstances.`
  },
  {
    paragraphId: 6,
    type: "neutral",
    text: `A loop is used when you want the computer to repeat the same action many times without writing the same line again and again. For example, you can loop through a list of five names and print each one in turn. Instead of copying the print instruction five times, you write one loop that handles all the names. This makes programs shorter, easier to read, and less likely to contain repeated mistakes.`
  },
  {
    paragraphId: 7,
    type: "neutral",
    text: `An array, sometimes called a list, is a way to store many values under one name. You can imagine it as a row of boxes numbered in order, like seats in a small theater. Each seat can hold one value, such as a test score or a shopping price. The program can visit each seat by its position, read the value inside, and use it in calculations or decisions.`
  },
  {
    paragraphId: 8,
    type: "neutral",
    text: `A very simple program using an array might store the daily temperatures for one week. There would be seven positions in the array, one for each day, such as Monday through Sunday. The program can loop through all these values to find the highest or lowest temperature. This saves time compared with handling each day using separate variables and separate lines of code.`
  },
  {
    paragraphId: 9,
    type: "neutral",
    text: `Functions are small groups of instructions that perform one specific task and can be reused many times. For example, you might write a function that takes a person’s name and prints a friendly greeting. Whenever the program needs to greet someone, it calls this function instead of rewriting the same lines. This keeps the main part of the program tidy and helps organize the code into meaningful pieces.`
  },
  {
    paragraphId: 10,
    type: "neutral",
    text: `When you press a key on the keyboard, the computer turns that physical action into a small code that the running program can understand. The program can then decide what to do with it, such as adding a letter to a document or moving a character in a game. From the user’s point of view, this feels instant and natural. Behind the scenes, it is simply a fast exchange of codes and instructions.`
  },

  // partly confusing paragraphs
  {
    paragraphId: 11,
    type: "partly_confusing",
    text: `Many mobile apps let you create an account so your data is saved even if you delete the app or switch phones later on. When you tap the “save” button, the app sends this record to a remote computer called a server, which writes it into a database table and replies with a confirmation that the changes were successful. In a larger system, though, that record may first pass through an orchestration layer that rewrites it into a normalized event format before it ever touches the main storage engine, which can cause subtle timing differences between what you see and what is actually committed. If the event bus becomes congested, two versions of the same profile can temporarily coexist inside different processing pipelines, and the configuration shown on your screen might reflect an intermediate snapshot that no longer matches the final, reconciled state.`
  },
  {
    paragraphId: 12,
    type: "partly_confusing",
    text: `A simple chat application can store messages in a list, where each entry holds the sender’s name, the time it was sent, and the text of the message. The app can then display the list in order, showing the oldest messages at the top and the newest ones at the bottom so the conversation feels natural and easy to follow. In production environments, the list is often backed by a distributed log, and the visible message order may depend on how quickly different brokers replicate each entry, rather than strictly on the moment each person tapped the send button. During network delays, two users may see slightly different message sequences because their devices subscribe to different offsets in the same log, creating brief periods where the conversation appears out of order until the system converges again.`
  },
  {
    paragraphId: 13,
    type: "partly_confusing",
    text: `When you stream a movie online, your device downloads small chunks of video instead of the entire file at once. The video player keeps a short buffer of upcoming seconds so that if your connection slows down a little, it can keep showing the movie while it waits for more data to arrive. Behind the scenes, an adaptive bitrate algorithm continuously samples network throughput and swaps playlists on the fly, which means different segments of the same movie can arrive from separate content delivery nodes using independently optimized encodings. If the adaptation logic overreacts to short drops in speed, the player may oscillate between several quality levels, and the timing of those switches can cause unexpected stalls that are hard to diagnose from the user’s perspective.`
  },
  {
    paragraphId: 14,
    type: "partly_confusing",
    text: `Many websites remember items you put into a shopping cart so you can browse other pages without losing your selections. When you remove an item, the website simply updates that cart and recalculates the total price so you can see the new amount before checking out. In a real e-commerce platform, the cart may live in a session store that is periodically evicted, and recovering it can depend on a cache key that is silently regenerated whenever the load balancer routes your request to a different backend instance. During heavy traffic, two carts with similar contents can be merged incorrectly if their keys collide, producing strange situations where new items appear or disappear without the shopper taking any direct action.`
  },
  {
    paragraphId: 15,
    type: "partly_confusing",
    text: `A basic password reset feature sends an email with a link that lets you choose a new password. When you click the link, the website reads the code, verifies that it is still valid, and then shows a page where you can type and confirm your new password. In complex identity systems, this code might actually be a signed token chained through several identity providers, and its validity depends on synchronized clocks and trust relationships that end users are never told about explicitly. If any of these clocks drift or one provider revokes a key unexpectedly, the reset link can fail silently, forcing the user through repeated attempts while the logs only record low-level cryptographic errors.`
  },
  {
    paragraphId: 16,
    type: "partly_confusing",
    text: `Simple note-taking apps often store each note as a separate entry with a title and body text. If you edit a note later, the app overwrites the previous version so you only see the latest version of your thoughts and do not have to manage extra copies yourself. Some collaborative editors instead treat every keystroke as a separate operation that must be merged with other users’ edits using conflict-free replicated data types, which depend on hidden identifiers and version vectors rather than simple overwrite rules. When those merge rules interact badly with network latency, the final text can contain duplicated or reordered fragments, and users may not understand why their changes appeared to be “ignored” until the document is refreshed.`
  },
  {
    paragraphId: 17,
    type: "partly_confusing",
    text: `A basic search bar on a website might scan through a list of product names and show you only the ones that contain the words you typed. The results can be sorted by name or price so you can quickly scan the list and decide which product you want to learn more about. Larger sites usually rely on an inverted index stored across multiple shards, and each query is rewritten into a series of term lookups that may hit different servers before the results are merged and ranked. If one shard is slow to respond, the system may return partial results and quietly treat the missing documents as if they did not match, which can make search feel inconsistent without showing any visible error.`
  },
  {
    paragraphId: 18,
    type: "partly_confusing",
    text: `When you upload a photo to a social media app, it often creates a smaller version of the picture so it loads faster on phones with slower connections. The app might also store simple information like when the photo was taken and which album it belongs to, so it can group and display your pictures in a helpful way. In large platforms, the original image can be pushed into a cold storage tier while replicas of various sizes are generated by a processing pipeline that runs asynchronously on a separate fleet of workers. If that pipeline falls behind, users may see temporary placeholders or outdated thumbnails, and the mapping between the visible image and its underlying storage location becomes opaque even to many internal tools.`
  },
  {
    paragraphId: 19,
    type: "partly_confusing",
    text: `Many educational websites let students complete quizzes online and then immediately show which answers were correct. Teachers can later download a summary that shows how the whole class performed on each question, which helps them see where students might need extra explanation or practice. Some platforms also feed these responses into adaptive models that silently adjust the difficulty of later questions, using item response theory to estimate each student’s hidden skill level across multiple dimensions. Because these adjustments happen behind the scenes, students may suddenly encounter questions that feel too hard or too easy, without any clear indication that the system has reclassified their ability based on previous interaction patterns.`
  },
  {
    paragraphId: 20,
    type: "partly_confusing",
    text: `A simple to-do list app lets you add tasks, mark them as done, and delete them when they are no longer needed. Some versions also let you assign due dates so the app can show reminders or highlight tasks that are coming up soon. In team-based task managers, each item may be part of a dependency graph where completing one task automatically unlocks others, and the underlying engine must constantly recompute which tasks are eligible to be started. When many people work on related tasks at once, small mistakes in the dependency graph can freeze entire sections of a project, because no user interface element reveals the hidden constraints that are blocking progress.`
  },

  // fully confusing paragraphs
  {
    paragraphId: 21,
    type: "fully_confusing",
    text: `Recent work in homotopy type theory treats programs as paths in higher-dimensional spaces, so proving two functions equivalent can require constructing continuous deformations between their proofs rather than comparing outputs, which makes even simple refactorings depend on fragile higher-inductive encodings. Doctoral projects that extend these systems often combine univalence axioms, cubical models, and synthetic homotopy, leaving apparently minor changes in a library’s definition order capable of breaking downstream proofs in ways that feel more topological than computational to anyone trained only in conventional semantics. Because of this, automated proof repair rarely behaves intuitively; a small edit near a base point may force expensive global recomputation of path equalities, so the practical cost of renaming a constructor can scale with geometric complexity rather than code size. In practice, many prototype proof assistants expose partially implemented features, undocumented tactics, and version-specific bugs, so reproducing a published result often requires reverse-engineering the author’s development environment instead of following the written proof script step by step.`
  },
  {
    paragraphId: 22,
    type: "fully_confusing",
    text: `In modern Byzantine fault tolerant consensus, protocols like HotStuff and Jolteon interleave speculative fast paths with view-change mechanisms, so a block may be optimistically committed under one quorum certificate while still remaining vulnerable to rollback if a conflicting proposal later gathers a stronger intersection. Formal analyses at the PhD level often reason in partially synchronous models where message delays are bounded only eventually, which forces proofs to juggle infinite executions, adversarial schedulers, and subtle liveness conditions that rarely line up cleanly with the protocol’s pseudo-code. As a result, the safety argument that “no two honest replicas decide different blocks” often hides an intricate invariance proof over evolving lock heights, justifications, and commit rules that cannot be inspected experimentally without instrumenting the protocol at each logical round. Debugging real implementations becomes harder when optimizations like message aggregation and pipelining reorder events, so traces collected from test networks no longer correspond one-to-one with the abstract states assumed in the proof, even though both are described as executions of the same algorithm.`
  },
  {
    paragraphId: 23,
    type: "fully_confusing",
    text: `In differential privacy research, composing multiple randomized mechanisms requires reasoning about Rényi divergence across adjacent databases, so guaranteeing that a training pipeline stays within a global epsilon budget often involves symbolic accounting over privacy loss distributions rather than simply clipping gradients or adding independent Gaussian noise. Advanced algorithms such as DP-SGD track a privacy ledger through every mini-batch update, but rigorous analysis at the dissertation level still has to bound the tail behavior of composed mechanisms using moments accountants, which many practitioners treat as a black-box spreadsheet rather than a mathematical object. Subtle implementation details, like reusing random seeds or shuffling client updates in federated settings, can invalidate theoretical guarantees without changing validation accuracy, so experiments that appear benign from a machine-learning perspective may be catastrophically non-private when examined under the formal definition. Because of this, reproducibility in differential privacy often demands archiving not just code and hyperparameters but also the full composition history of every mechanism applied to the data, a requirement that clashes with standard software engineering practices and most open-source release norms.`
  },
  {
    paragraphId: 24,
    type: "fully_confusing",
    text: `PhD-level work in abstract interpretation treats static analysis as computing fixed points over lattices of program properties, so deciding whether a variable might be null becomes equivalent to solving a monotone equation system whose solution must be approximated by widening and narrowing operators rather than computed exactly. When these analyses are applied to real languages with exceptions, reflection, and concurrency, the underlying domains explode in dimensionality, forcing researchers to design highly specialized abstractions that are sound but so coarse that the alarms they produce rarely match any intuitive notion of how the source code behaves. Experimental evaluations therefore report metrics like precision and recall over millions of automatically generated warnings, but small tweaks in the abstract domain or widening schedule can change those numbers dramatically in ways that cannot be inferred from the implementation’s public API or documentation. As a result, industrial tools derived from these theories often appear arbitrary to developers, who see some bug patterns flagged and others ignored without realizing that the underlying mathematics forbids the analyzer from representing the exact control-flow distinctions they care about most.`
  },
  {
    paragraphId: 25,
    type: "fully_confusing",
    text: `In categorical semantics for programming languages, a seemingly simple question like whether a function can safely duplicate its argument is answered by checking whether the underlying morphism lives in a cartesian closed category, a linear category, or some higher-order structure equipped with comonads that model resource duplication. PhD theses in this area often juggle multiple layers of abstraction, mapping syntax to typed lambda calculi, then interpreting those types in functor categories whose objects are themselves indexed families of sets or domains, which makes even basic substitution lemmas depend on elaborate naturality conditions. Because diagrams commute only up to isomorphism in many constructions, proofs frequently rely on “up to coherent isomorphism” reasoning that is difficult to encode in proof assistants, so published arguments skip steps that readers must mentally reconstruct using unstated familiarity with the corresponding categorical folklore. Students encountering these models for the first time often find that every concrete example, such as interpreting a simple recursive function, suddenly depends on a large stack of definitions about limits, exponentials, and fixed-point operators that were introduced only for the sake of semantic completeness.`
  },
  {
    paragraphId: 26,
    type: "fully_confusing",
    text: `In inductive program synthesis, constraint solvers encode the entire search over candidate programs as satisfiability modulo theories problems, so a single incorrect or missing clause in the logical specification can silently steer the solver toward bizarre implementations that satisfy all examples while completely violating the intended behavior. Doctoral-level systems like CEGIS loops repeatedly call SMT solvers with increasingly refined counterexamples, but their convergence guarantees usually depend on obscure properties such as the completeness of background theories or the syntactic structure of the template language rather than any intuitive measure of program simplicity. Even when a synthesizer appears to work well on benchmark tasks, tiny changes in the example set or grammar can cause huge shifts in performance, making it unclear whether empirical success reflects a robust underlying method or just accidental alignment between the dataset and the solver’s search heuristics. As a result, reproducing the reported accuracy of a synthesis system often requires not only the published code but also the exact solver version, seed initialization strategy, and benchmark preprocessing scripts, details that are frequently omitted or under-documented in conference papers.`
  },
  {
    paragraphId: 27,
    type: "fully_confusing",
    text: `Research on GPU memory consistency models often specifies ordering guarantees using partial orders over events, so whether one kernel’s writes are visible to another depends on subtle combinations of fences, scopes, and cache behaviors that are usually described in dense operational semantics rather than human-readable documentation. PhD theses exploring relaxed memory often construct litmus tests that reveal surprising reorderings, but interpreting those experiments requires understanding how hardware speculation, compiler optimizations, and synchronization primitives interact, a perspective that is difficult to gain from conventional programming courses focused on sequential correctness. Even formally verified libraries for atomic operations may only guarantee properties within an abstract machine model, leaving significant gaps between what the proofs establish and how real devices behave when thermal throttling, power management, or driver bugs disturb the assumed timing and ordering constraints. Consequently, performance anomalies that developers attribute to “random slowdowns” sometimes trace back to legitimate executions allowed by the memory model, but diagnosing this requires reading architecture white-papers and academic formalisations that almost never appear in day-to-day engineering workflows.`
  },
  {
    paragraphId: 28,
    type: "fully_confusing",
    text: `In deep neural network interpretability, methods like Integrated Gradients and SHAP assign importance scores along continuous paths in input space, so a single prediction’s explanation can depend sensitively on arbitrary baseline choices that lack any obvious psychological or domain-specific meaning for end users. Doctoral research often formalizes these techniques using axioms such as completeness and sensitivity, but practical implementations approximate integrals with a handful of samples, which can introduce numerical artifacts that swamp the theoretically justified structure and make identical models appear to behave differently under slightly changed configurations. Evaluations therefore report consistency metrics over thousands of random perturbations, yet these numbers rarely correlate with human intuition about what features matter, leaving it unclear whether improved scores actually help practitioners debug, trust, or modify the underlying systems. As a consequence, academic interpretability toolkits proliferate while industrial teams often fallback to simple feature rankings or manual probing, creating a disconnect between what the research community measures and what engineers need to make safe design decisions.`
  },
  {
    paragraphId: 29,
    type: "fully_confusing",
    text: `Theoretical reinforcement learning work at the PhD level often analyzes regret bounds for agents in partially observable Markov decision processes, so statements about “near-optimal exploration” translate into inequalities over belief states in high-dimensional simplices that no longer resemble the intuitive notion of visiting every state enough times. Recent algorithms combine optimism in the face of uncertainty with posterior sampling and function approximation, but formal guarantees usually require unrealistic assumptions such as realizability or precise knowledge of noise distributions, conditions that are rarely met in the messy environments where practitioners hope to apply these methods. Empirical benchmarks, meanwhile, often use carefully shaped reward functions and engineered observation spaces, making it difficult to tell whether success arises from the theoretical insights, the hand-tuned environment design, or incidental properties of the chosen simulator. Consequently, translating these results into reliable educational tools or industrial controllers demands an additional layer of heuristic engineering that is almost never captured in the formal regret analyses presented in dissertations and conference papers.`
  },
  {
    paragraphId: 30,
    type: "fully_confusing",
    text: `In quantum algorithm design, even simple-sounding speedups like Grover’s search rely on amplitude amplification over complex vector spaces, so implementing them on near-term hardware requires decomposing high-level oracles into fault-tolerant gate sets whose depth quickly exceeds what noisy intermediate-scale devices can support. PhD-level resource estimates track not only logical gate counts but also distillation of magic states, error-correction overheads, and constraints from limited qubit connectivity, making the difference between a “practical” and “impractical” algorithm hinge on hardware roadmaps that are themselves speculative research artifacts. Meanwhile, quantum programming languages embed reversible circuit descriptions inside classical host languages, so debugging often involves stepping through opaque intermediate representations or visualizing enormous circuit diagrams rather than inspecting familiar variable values and control-flow graphs. For students, this combination of abstract mathematical notation, hardware constraints, and unusual tooling means that even toy examples, such as preparing a Bell state, can feel disconnected from any intuitive understanding of how computation normally progresses on conventional architectures.`
  },
];

export default paragraphs;