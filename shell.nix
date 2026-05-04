let
  pkgs = import <nixpkgs> { };
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_25
  ];

  shellHook = ''
    echo "Node: $(node --version)"
    echo "npm:  $(npm --version)"
  '';
}
