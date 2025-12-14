import pandas as pd
import json

# Define the order of taxonomic levels from broadest (root) to narrowest (leaf)
TAXONOMIC_LEVELS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']
# Pre-calculate the level indices for the length calculation
LEVEL_INDICES = {level: i for i, level in enumerate(TAXONOMIC_LEVELS)}
TOTAL_LEVELS = len(TAXONOMIC_LEVELS)

# The constant for length calculation (e.g., 1.0 or 10.0)
# Length = C / (level_index + 1). Higher index (narrower level) means shorter length.
LENGTH_CONSTANT = 1.0

def build_structured_taxonomy(df):
    """
    Builds a nested dictionary structure from the DataFrame that includes 
    node names, branch lengths, and children.
    
    Structure: {'NodeName': {'length': float, 'children': {child_name: child_data, ...}}}
    """
    # The root node for the internal structure
    # The final output will be the 'children' of the 'Root' node.
    tree_dict = {"Root": {'length': 0.0, 'children': {}}}
    
    # Iterate through each row (each species' full classification)
    for index, row in df.iterrows():
        current_node = tree_dict["Root"]
        
        # Traverse from Kingdom down to Species
        for i, level in enumerate(TAXONOMIC_LEVELS):
            # 1. Handle 'nan' and get the node name
            name = str(row[level]).strip()
            
            # Check for missing data (including 'nan' strings)
            if pd.isna(row[level]) or name == '' or name.lower() == 'nan':
                node_name = 'not specified'
            else:
                node_name = name
            
            # 2. Calculate the branch length (inversely proportional to level)
            # Level index i=0 (kingdom) gives LENGTH_CONSTANT/(0+1) = 1.0
            # Level index i=6 (species) gives LENGTH_CONSTANT/(6+1) = ~0.143
            branch_length = LENGTH_CONSTANT / (i + 1)
            
            # Get the dictionary of children for the current node
            children_dict = current_node['children']
            
            # 3. Add the node if it's not yet in the children dictionary
            if node_name not in children_dict:
                # Add the new node structure
                children_dict[node_name] = {
                    'length': branch_length,
                    'children': {}
                }
                
            # 4. Move down to the newly created/existing node for the next iteration
            current_node = children_dict[node_name]
            
    # Return the structure starting from the top-most level (Kingdoms)
    return tree_dict["Root"]['children']

def create_taxonomy_json_file(csv_filepath, output_filepath):
    """
    Reads CSV, builds the structured taxonomic tree, and writes it 
    as a JSON file.
    """
    try:
        # 1. Load the CSV data
        # Note: pd.read_csv handles 'nan' conversion for us
        df = pd.read_csv(csv_filepath)
        
        # Check for necessary columns
        if not all(col in df.columns for col in TAXONOMIC_LEVELS):
            missing = [col for col in TAXONOMIC_LEVELS if col not in df.columns]
            print(f"Error: CSV is missing required columns: {', '.join(missing)}")
            return
        
        # 2. Build the nested dictionary structure with lengths
        taxonomy_structure = build_structured_taxonomy(df)
        
        # 3. Write the resulting dictionary to the JSON file
        # 'indent=4' makes the JSON human-readable (pretty-printed)
        with open(output_filepath, 'w') as f:
            json.dump(taxonomy_structure, f, indent=4)
        
        print(f"Successfully created JSON taxonomy file at: {output_filepath}")
        
    except FileNotFoundError:
        print(f"Error: Input file not found at {csv_filepath}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

# --- Configuration ---
CSV_FILE = 'biotime_taxonomy.csv' 
JSON_FILE = 'taxonomy_tree_structured.json' 

# Execute the new function
create_taxonomy_json_file(CSV_FILE, JSON_FILE)